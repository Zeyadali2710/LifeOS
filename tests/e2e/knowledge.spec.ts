import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { E2E_DB_URL, seedHeartbeat, signIn } from "./owner";
import { createDb } from "@/server/db/client";
import { knowledgeItems } from "@/server/db/schema";

test.beforeAll(seedHeartbeat);
const created: string[] = [];
test.afterEach(async () => {
  if (!created.length) return;
  const conn = createDb(E2E_DB_URL);
  try { await conn.db.delete(knowledgeItems).where(inArray(knowledgeItems.id, created.splice(0))); } finally { await conn.pool.end(); }
});
async function seed(rows: { kind: string; title: string; body?: string; tags?: string[]; url?: string }[]) {
  const conn = createDb(E2E_DB_URL);
  try {
    const out = await conn.db.insert(knowledgeItems).values(rows.map((r) => ({ body: "", tags: [], ...r }))).returning({ id: knowledgeItems.id });
    created.push(...out.map((o) => o.id));
    return out.map((o) => o.id);
  } finally { await conn.pool.end(); }
}

test("knowledge requires sign-in", async ({ page }) => {
  await page.goto("/knowledge");
  await expect(page).toHaveURL(/\/login/);
});

test("keyword search, sections, tags, detail and semantic opt-in notice", async ({ page }) => {
  const u = randomUUID().slice(0, 8);
  await seed([
    { kind: "research", title: `Event log architecture ${u}`, body: "Append-only logs make agent actions replayable.", tags: [`arch${u}`] },
    { kind: "bookmark", title: `Kleppmann talk ${u}`, url: "https://example.com/talk", tags: [`arch${u}`] },
    { kind: "note", title: `Coffee with Priya ${u}`, body: "Follow up with a blurb." },
  ]);
  await signIn(page);
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everything you've read, written and saved.");

  await page.getByRole("searchbox", { name: "Search knowledge" }).or(page.getByLabel("Search knowledge")).fill(`replay ${u}`);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=replay/);
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("button", { name: new RegExp(`Event log architecture ${u}`) })).toBeVisible();
  await expect(results.getByRole("button", { name: new RegExp(`Coffee with Priya ${u}`) })).toHaveCount(0);

  await results.getByRole("button", { name: new RegExp(`Event log architecture ${u}`) }).click();
  const article = page.getByRole("article", { name: `Event log architecture ${u}` });
  await expect(article.getByText("Append-only logs make agent actions replayable.")).toBeVisible();

  await page.goto(`/knowledge?tags=arch${u}`);
  await expect(page.getByRole("search").getByRole("button", { name: new RegExp(`#arch${u}`) })).toHaveAttribute("aria-pressed", "true");
  await expect(results.getByRole("button")).toHaveCount(2);
  await page.getByRole("navigation", { name: "Knowledge sections" }).getByRole("button", { name: /Bookmarks/ }).click();
  await expect(results.getByRole("button")).toHaveCount(1);

  await page.getByRole("radio", { name: "semantic" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Semantic search (is off|needs an OpenRouter key)/ })).toBeVisible();
});

test("create, edit and delete a note through the dialog", async ({ page }) => {
  const u = randomUUID().slice(0, 8);
  await signIn(page);
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "New item" }).click();
  const dialog = page.getByRole("dialog", { name: "New knowledge item" });
  await dialog.getByLabel("Title").fill(`Approval UX ${u}`);
  await dialog.getByLabel("Text").fill("Show what will happen, why, and which account.");
  await dialog.getByLabel("Tags").fill("UX, #agents");
  await dialog.getByRole("button", { name: "Add" }).click();
  const article = page.getByRole("article", { name: `Approval UX ${u}` });
  await expect(article).toBeVisible();
  const id = new URL(page.url()).searchParams.get("item")!;
  created.push(id);
  await expect(article.getByText("#ux")).toBeVisible();

  await article.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit item" });
  await edit.getByLabel("Title").fill(`Approval UX principles ${u}`);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("article", { name: `Approval UX principles ${u}` })).toBeVisible();

  await page.getByRole("article").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete this item?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("bookmark without a link shows the validation error", async ({ page }) => {
  await signIn(page);
  await page.goto("/knowledge?kind=bookmark");
  await page.getByRole("button", { name: "New item" }).click();
  const dialog = page.getByRole("dialog", { name: "New knowledge item" });
  await dialog.getByLabel("Title").fill("No link");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Bookmarks need a link.");
});
