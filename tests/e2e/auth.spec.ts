import { expect, test } from "@playwright/test";
import { E2E_OWNER } from "./owner";

test("unauthenticated visitors are redirected to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

test("protected API routes return 401 without a session", async ({ request }) => {
  const res = await request.get("/api/anything", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test("wrong password shows an error and no session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Incorrect email or password/);
  await expect(page).toHaveURL(/\/login$/);
});

test("owner can sign in and out; session cookie is hardened", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER.email);
  await page.getByLabel("Password").fill(E2E_OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ada.");
  await expect(page.getByText("Database")).toBeVisible();

  const session = (await context.cookies()).find((c) => c.name.includes("session_token"));
  expect(session).toBeDefined();
  expect(session!.httpOnly).toBe(true);
  expect(session!.secure).toBe(true);
  expect(session!.sameSite).toBe("Lax");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("responses carry security headers", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("login ignores off-origin `next` redirects", async ({ page }) => {
  await page.goto("/login?next=/%5Cevil.example");
  await page.getByLabel("Email").fill(E2E_OWNER.email);
  await page.getByLabel("Password").fill(E2E_OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ada.");
  expect(new URL(page.url()).host).toBe("localhost:3100");
});

test("sign-in is rate limited per client", async ({ request, baseURL }, testInfo) => {
  // Distinct IP per project so the limit doesn't bleed into other tests.
  const ip = testInfo.project.name === "mobile" ? "203.0.113.20" : "203.0.113.10";
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: baseURL!, "x-forwarded-for": ip },
      data: { email: E2E_OWNER.email, password: "wrong-password-xyz" },
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
  expect(statuses[5]).toBe(429);
});

test("public sign-up is disabled", async ({ request, baseURL }) => {
  const res = await request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: { email: "intruder@example.com", password: "intruder-password-1", name: "x" },
  });
  expect(res.ok()).toBe(false);
});
