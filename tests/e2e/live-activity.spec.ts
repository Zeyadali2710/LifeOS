import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { E2E_DB_URL, E2E_OWNER, seedHeartbeat, signIn } from "./owner";

test.beforeAll(seedHeartbeat);

test("live activity: auth guard, fast SSE open, new event appears without refresh", async ({ page, browser, playwright, baseURL }, info) => {
  test.skip(info.project.name !== "desktop");

  // (1) unauthenticated SSE is refused
  const anon = await playwright.request.newContext({ baseURL: baseURL! });
  expect((await anon.get("/api/events", { maxRedirects: 0 })).status()).toBe(401);
  await anon.dispose();

  await signIn(page);
  const log = page.getByRole("log");
  await expect(page.getByRole("region", { name: "Live activity" })).toBeVisible();

  // (2) SSE first frame is fast on the prod build
  const openMs = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const t0 = performance.now();
        const es = new EventSource("/api/events");
        es.addEventListener("open", () => {
          es.close();
          resolve(performance.now() - t0);
        });
        es.addEventListener("error", () => reject(new Error("sse error")));
      }),
  );
  expect(openMs).toBeLessThan(2000);

  // (3) a failed sign-in from another browser shows up live, no reload
  const unreadOf = async () => {
    const l = (await page.getByRole("banner").getByRole("button", { name: /^Notifications/ }).getAttribute("aria-label")) ?? "";
    return Number(/(\d+) unread/.exec(l)?.[1] ?? 0);
  };
  const before = await unreadOf();
  const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${200 + Math.floor(Math.random() * 50)}` } });
  const p2 = await other.newPage();
  await p2.goto("/login");
  await p2.getByLabel("Email").fill(E2E_OWNER.email);
  await p2.getByLabel("Password").fill("definitely-wrong-password");
  await p2.getByRole("button", { name: "Sign in" }).click();
  await expect(p2.getByRole("main").getByRole("alert")).toBeVisible();
  await other.close();

  await expect(log).toContainText("Failed sign-in attempt", { timeout: 10_000 });
  const bellUp = await expect.poll(unreadOf, { timeout: 3000 }).toBeGreaterThan(before).then(() => true, () => false);
  if (!bellUp) {
    // notification throttle: an earlier failed sign-in within 10 min already created the row
    const c = new Client({ connectionString: E2E_DB_URL });
    await c.connect();
    const r = await c.query("select 1 from notifications where title = 'Failed sign-in attempt' limit 1");
    await c.end();
    expect(r.rowCount).toBeGreaterThan(0);
  }

  // (4) no emails or IPs in activity text
  const text = (await log.innerText()) ?? "";
  expect(text).not.toContain("@");
  expect(text).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
});

test("live stream sends a revoked session to /login instead of retrying forever", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop");
  // EventSource can't see the 401 status; the client must notice the dead session another way.
  await page.route("**/api/events", (r) => r.fulfill({ status: 401, body: "" }));
  await signIn(page);
  const token = decodeURIComponent((await context.cookies()).find((c) => c.name.includes("session_token"))!.value).split(".")[0];
  const c = new Client({ connectionString: E2E_DB_URL });
  await c.connect();
  await c.query("delete from sessions where token = $1", [token]);
  await c.end();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
});
