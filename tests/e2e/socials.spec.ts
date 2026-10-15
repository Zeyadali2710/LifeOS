import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { deleteProject, deleteSocialPost, insertSocialSource, runSocialMockExecutor, seedHeartbeat, signIn, socialPostState } from "./owner";

test.beforeEach(async ({ page }) => { await seedHeartbeat(); await signIn(page); });

test("project source → corrected Instagram variant → edited approval → schedule → actual mock publish", async ({ page }) => {
  const title = `Social build ${randomBytes(4).toString("hex")}`;
  const source = await insertSocialSource(title);
  let postId: string | null = null;
  try {
    await page.goto(`/socials?new=1&source=project&sourceId=${source}`);
    const dialog = page.getByRole("dialog", { name: "New post" });
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(title);
    for (const platform of ["LinkedIn", "TikTok", "Portfolio"]) await dialog.getByRole("checkbox", { name: platform, exact: true }).uncheck();
    await dialog.getByRole("button", { name: "Create post", exact: true }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    postId = new URL(page.url()).searchParams.get("post")!;
    const text = page.getByRole("textbox", { name: "Instagram text", exact: true });
    await text.fill("x".repeat(2201));
    await expect(page.getByRole("button", { name: `Schedule ${title} on Instagram`, exact: true })).toBeDisabled();
    await text.fill("Draft from my project");
    await page.getByLabel("Public image URL", { exact: true }).fill("https://images.example.com/owner.jpg");
    await page.getByRole("button", { name: "Save Instagram changes", exact: true }).click();
    await expect(page.getByRole("button", { name: `Schedule ${title} on Instagram`, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: `Schedule ${title} on Instagram`, exact: true }).click();
    const schedule = page.getByRole("dialog", { name: "Schedule on Instagram" });
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await schedule.getByLabel("Date", { exact: true }).fill(tomorrow);
    await schedule.getByRole("button", { name: "Request approval", exact: true }).click();
    await expect(page).toHaveURL(/\/approvals\?id=/);
    const review = page.getByRole("article", { name: "Approval detail" });
    await expect(review.getByText("MOCK · nothing leaves LifeOS", { exact: true })).toBeVisible();
    await expect(review.getByText(/Drafted from project\/event\/repo content/)).toBeVisible();
    await review.getByRole("button", { name: "EDIT", exact: true }).click();
    await review.getByLabel("Post text", { exact: true }).fill("Owner reviewed this project update");
    await expect(review.getByText("EDITED", { exact: true })).toBeVisible();
    await review.getByRole("button", { name: "APPROVE", exact: true }).click();
    await expect(review.getByRole("status")).toContainText("Scheduled");
    await expect.poll(async () => (await socialPostState(postId!))[0]?.text).toBe("Owner reviewed this project update");
    await review.getByRole("link", { name: "View in Socials" }).click();
    await expect(page.getByRole("button", { name: `Reschedule ${title} on Instagram`, exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Instagram text", exact: true })).toHaveCount(0);
    const result = runSocialMockExecutor("publish", postId);
    expect(result.status).toBe("published"); expect(result.remoteId).toMatch(/^mock:/);
    // The worker's production executor emits the dedicated Social signal: no reload.
    await expect(page.getByText("MOCK · nothing left LifeOS", { exact: true })).toBeVisible();
    expect((await socialPostState(postId))[0]).toMatchObject({ status: "published", is_mock: true, remote_url: null });
  } finally { if (postId) await deleteSocialPost(postId); await deleteProject(source); }
});

test("TikTok uses copy and owner Mark as posted, without approval", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const title = `Manual caption ${randomBytes(4).toString("hex")}`;
  let postId: string | null = null;
  try {
    await page.goto("/socials?new=1");
    const dialog = page.getByRole("dialog", { name: "New post" });
    await dialog.getByLabel("Title", { exact: true }).fill(title);
    await dialog.getByLabel("Idea", { exact: true }).fill("My manual caption");
    for (const platform of ["LinkedIn", "Instagram", "Portfolio"]) await dialog.getByRole("checkbox", { name: platform, exact: true }).uncheck();
    await dialog.getByRole("button", { name: "Create post", exact: true }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    postId = new URL(page.url()).searchParams.get("post")!;
    await page.getByRole("button", { name: `Copy the TikTok caption for ${title}`, exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("My manual caption");
    await page.getByRole("button", { name: `Mark ${title} as posted on TikTok`, exact: true }).click();
    const manual = page.getByRole("dialog", { name: "Mark as posted on TikTok" });
    await manual.getByRole("button", { name: "Mark as posted", exact: true }).click();
    await expect.poll(async () => (await socialPostState(postId!))[0]?.status).toBe("posted_manually");
  } finally { if (postId) await deleteSocialPost(postId); }
});

test("a removed real credential cannot turn its queued publish into mock publication", async ({ page }) => {
  const result = runSocialMockExecutor("removed-real");
  try {
    expect(result).toMatchObject({ status: "failed", remoteId: null });
    expect((await socialPostState(result.postId))[0]).toMatchObject({ status: "failed", is_mock: false, remote_id: null });
    await page.goto(`/socials?post=${result.postId}`);
    await expect(page.getByText("Connection or approved content changed. Request a new approval.", { exact: true })).toBeVisible();
  } finally { await deleteSocialPost(result.postId); }
});
