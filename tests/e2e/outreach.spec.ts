import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { deleteApprovalRun, deleteMailMessage, deleteOutreachEvent, insertGmailConnection, insertMailApproval, insertMailMessage, insertOutreachEvent, readApproval, removeGmailConnection, signIn } from "./owner";

const uid = () => randomBytes(4).toString("hex");
const events: string[] = [];
const mails: string[] = [];
const approvals: string[] = [];
test.afterEach(async () => {
  for (const id of approvals.splice(0)) await deleteApprovalRun(id);
  for (const id of mails.splice(0)) await deleteMailMessage(id);
  for (const id of events.splice(0)) await deleteOutreachEvent(id);
  await removeGmailConnection();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("outreach page renders the EVENTS tab and honest empty state", async ({ page }) => {
  await page.goto("/outreach");
  await expect(page.getByRole("heading", { name: "Outreach", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /EVENTS/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: "Filter by interest" })).toBeVisible();
});

test("?import=1 opens the import dialog once and shows the field error", async ({ page }) => {
  await page.goto("/outreach?import=1");
  const dlg = page.getByRole("dialog", { name: "Import an event" });
  await expect(dlg).toBeVisible();
  await expect(page).toHaveURL(/\/outreach$/);
  await dlg.getByLabel("Event page URL").fill("not a url");
  await dlg.getByRole("button", { name: "Import event" }).click();
  await expect(dlg.getByText("Enter a full https:// address.")).toBeVisible();
});

test("unknown event id shows the not-found state", async ({ page }) => {
  await page.goto("/outreach/events/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
  await page.goto("/outreach/events/nope");
  await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
});

test("pipeline view shows the empty state or the five columns", async ({ page }) => {
  await page.goto("/outreach?view=pipeline");
  await expect(page.getByText(/saved events by stage/)).toBeVisible();
});

test("seeded event moves Save to Follow up and the task shows in FOLLOW-UPS", async ({ page }) => {
  const title = `Pipeline Summit ${uid()}`;
  events.push(await insertOutreachEvent({ title }));
  await page.goto("/outreach?mock=1");
  const card = page.getByRole("article").filter({ hasText: title });
  for (const name of [`Save ${title}`, `Mark ${title} interested`, `Attend ${title}`]) {
    const cell = card.getByRole("button", { name, exact: true });
    await cell.click();
    await expect(cell).toHaveAttribute("aria-pressed", "true");
  }
  await card.getByRole("link", { name: title }).click();
  await page.getByRole("button", { name: "Mark attended" }).click();
  await page.getByRole("button", { name: "Follow up", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Follow up" });
  await expect(dlg.getByLabel("Task 1 title")).toHaveValue(`Follow up: ${title}`);
  await dlg.getByRole("button", { name: "Create follow-up task" }).click();
  await expect(dlg).toBeHidden();
  await page.goto("/outreach?tab=follow-ups");
  await expect(page.getByText(`From event · ${title}`).locator("visible=true").first()).toBeVisible();
});

test("mock event shows MOCK and a disabled Calendar cell", async ({ page }) => {
  const title = `Mock Meetup ${uid()}`;
  events.push(await insertOutreachEvent({ title, isMock: true }));
  await page.goto("/outreach?mock=1");
  const card = page.getByRole("article").filter({ hasText: title });
  await expect(card.getByText("MOCK", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: `Add ${title} to calendar` })).toBeDisabled();
  await expect(card.getByText("Mock events can't go on your calendar.")).toBeAttached();
});

test("triaged mail shows summary and action items; Add as task lands in FOLLOW-UPS", async ({ page }) => {
  const u = uid();
  const subject = `Agenda ${u}`;
  await insertGmailConnection();
  const id = await insertMailMessage({ subject, fromName: "Lee Direct", fromAddress: "lee.direct@example.test", summary: `Lee wants the slides ${u}.`, actionItems: [{ text: `Send the slides ${u}`, due: null }] });
  mails.push(id);
  await page.goto(`/outreach?tab=email&mail=${id}`);
  await page.getByRole("button", { name: new RegExp(subject) }).click();
  const detail = page.getByRole("article", { name: subject });
  await expect(detail.getByText(`Lee wants the slides ${u}.`)).toBeVisible();
  await expect(detail.getByText(`Send the slides ${u}`)).toBeVisible();
  await detail.getByRole("button", { name: `Add Send the slides ${u} as a task` }).click();
  await expect(detail.getByText("Task added")).toBeVisible();
  await page.goto("/outreach?tab=follow-ups");
  await expect(page.getByRole("link", { name: new RegExp(`From email · ${subject} · Lee Direct`) })).toBeVisible();
});

test("pending mail_reply can be edited and approved from the email detail", async ({ page }) => {
  const subject = `Slides ${uid()}`;
  await insertGmailConnection();
  const mailId = await insertMailMessage({ subject, fromName: "Lee Direct", fromAddress: "lee.direct@example.test", summary: "Lee asks for the slides." });
  mails.push(mailId);
  const ap = await insertMailApproval({ mailId, subject });
  approvals.push(ap.id);
  await page.goto(`/outreach?tab=email&mail=${mailId}`);
  await page.getByRole("button", { name: new RegExp(subject) }).click();
  const detail = page.getByRole("article", { name: subject });
  await expect(detail.getByText("DRAFT REPLY · OUTREACH AGENT")).toBeVisible();
  await expect(detail.getByText("Lee Direct <lee.direct@example.test>", { exact: true })).toBeVisible();
  await expect(detail.getByText("Replies only go to people already in this thread.")).toBeVisible();
  await detail.getByRole("button", { name: "Edit draft" }).click();
  await expect(detail.getByRole("textbox", { name: /^(To|Cc)\b/ })).toHaveCount(0); // recipients stay read-only
  const body = `Edited reply ${uid()}`;
  await detail.getByLabel("Edit draft reply").fill(body);
  await detail.getByRole("button", { name: "Done editing" }).click();
  await expect(detail.getByText("EDITED", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Send reply" }).click();
  // The e2e stack has no worker or outbound network, so the honest outcome here is exactly "approved" and the
  // UI must not claim the reply was sent. "Approve → fake Gmail records exactly one send of the edited body" (D-37)
  // is asserted end to end in tests/db/mail-agent.test.ts ("sends the edited body once ...").
  await expect(page.getByText("Reply approved · sending")).toBeVisible();
  await expect(detail.getByText("Sending the reply…")).toBeVisible();
  await expect.poll(async () => (await readApproval(ap.id)).status).toBe("approved");
  const stored = await readApproval(ap.id);
  expect(stored.edited?.body).toBe(body);
  expect(stored.edited?.to).toEqual(ap.payload.to);
});

test("/approvals renders the mail_reply approval with the untrusted note and SEND REPLY", async ({ page }) => {
  const subject = `Intro ${uid()}`;
  const mailId = await insertMailMessage({ subject, fromName: "Lee Direct", fromAddress: "lee.direct@example.test", summary: "Intro." });
  mails.push(mailId);
  const ap = await insertMailApproval({ mailId, subject });
  approvals.push(ap.id);
  await page.goto(`/approvals?id=${ap.id}`);
  const d = page.getByRole("article", { name: "Approval detail" });
  await expect(d.getByText("Drafted from email content (untrusted)")).toBeVisible();
  await expect(d.getByRole("button", { name: "SEND REPLY" })).toBeEnabled();
});
