import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ApprovalDTO, RunDTO } from "@/lib/agent-types";
import { ApprovalsInbox } from "@/features/approvals/inbox";
import { ApprovalDetail } from "@/features/approvals/detail";
import { AgentsViewScreen } from "@/features/agents/agents-view";
import { MODELS } from "@/server/agents/registry";

const h = vi.hoisted(() => ({
  slots: [] as unknown[], index: 0, effects: [] as (() => unknown)[], search: new URLSearchParams(),
  live: {} as Record<string, (dto: unknown) => void>, toast: vi.fn(), refresh: vi.fn(),
  inspector: vi.fn(), trace: vi.fn(), approve: vi.fn(), reject: vi.fn(), save: vi.fn(), gmail: vi.fn(),
  cancel: vi.fn(), retry: vi.fn(), model: vi.fn(), changed: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial;
    return [h.slots[i], (value: unknown) => { h.slots[i] = typeof value === "function" ? value(h.slots[i]) : value; }];
  },
  useRef: (value: unknown) => { const i = h.index++; return h.slots[i] ??= { current: value }; },
  useEffect: (fn: () => unknown, deps: unknown[]) => {
    const i = h.index++, old = h.slots[i] as unknown[] | undefined;
    if (!old || deps.some((d, n) => d !== old[n])) { h.effects.push(fn); h.slots[i] = deps; }
  },
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }), useSearchParams: () => h.search }));
vi.mock("@/features/shell/shell-provider", () => ({ useShell: () => ({ toast: h.toast }) }));
vi.mock("@/features/shell/agent-status", () => ({ useAgentStatus: () => ({ refresh: h.refresh }), useApprovalCount: () => 0 }));
vi.mock("@/features/shell/live-provider", () => ({ useLiveEvents: (kind: string, cb: (dto: unknown) => void) => { h.live[kind] = cb; } }));
vi.mock("@/ui/motion", () => ({ useReducedMotion: () => true, setMotion: vi.fn() }));
vi.mock("@/server/agents-view-actions", () => ({ agentInspectorAction: h.inspector, runTraceAction: h.trace }));
vi.mock("@/server/agent-actions", () => ({ cancelRunAction: h.cancel, retryRunAction: h.retry, setAgentModelAction: h.model, pauseAgentAction: vi.fn(), pauseAllAction: vi.fn(), resumeAgentAction: vi.fn(), resumeAllAction: vi.fn() }));
vi.mock("@/server/approval-actions", () => ({ approveAction: h.approve, rejectAction: h.reject, saveEditAction: h.save, retryApprovalAction: vi.fn() }));
vi.mock("@/server/mail-actions", () => ({ saveReplyToDraftsAction: h.gmail }));
vi.mock("@/server/socials-actions", () => ({ socialReviewFacts: vi.fn() }));
vi.mock("@/features/approvals/project-body", () => ({ ProjectBody: () => null }));
vi.mock("@/features/approvals/finance-body", () => ({ FinanceBody: () => null }));

// Exercise component state and handlers without a browser, DOM, server, or extra dependencies.
type El = ReactElement<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
function nodes(value: unknown): El[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const e = value as El;
  return [e, ...nodes(e.props.children)];
}
const name = (e: El) => typeof e.type === "function" ? e.type.name : e.type;
const find = (tree: unknown, type: string) => nodes(tree).find((e) => name(e) === type)!;
function render(fn: () => unknown) { h.index = 0; return fn(); }
function invoke(e: El) { return (e.type as (props: El["props"]) => unknown)(e.props); }
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function effects() { for (const fn of h.effects.splice(0)) fn(); await Promise.resolve(); await Promise.resolve(); }
const issue = { repo: "o/r", title: "Title", body: "Body", labels: [] };
const approval = (id = "a", over: Partial<ApprovalDTO> = {}): ApprovalDTO => ({ id, kind: "issue", tool: "github.create_issue", agentId: "projects", runId: "r", status: "pending", original: issue, edited: null, createdAt: "2026-10-23T00:00:00Z", expiresAt: "2026-10-30T00:00:00Z", decidedAt: null, result: null, error: null, reason: null, repoPrivate: false, targetChanged: false, ...over });
const run = (status: RunDTO["status"] = "running", id = "r") => ({ id, agentId: "projects", status, prompt: "Do it", tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: null, startedAt: null, model: MODELS.sonnet }) as RunDTO;
const inspector = { id: "projects", model: "Sonnet", modelPref: MODELS.sonnet, routable: false, system: false, recent: [], tools: [], pending: null };
const agent = { id: "projects", name: "Projects", purpose: "Projects", live: true, status: "IDLE", currentTask: null, stats: null };
const props = () => ({ view: "office" as const, agents: [agent], runs: [], table: [], spend: { mtdUsd: 0, capUsd: 10 }, globalPaused: false, initialSel: "projects", initialInspector: inspector, initialTrace: null, approvals: { pending: [], resolved: [], selected: null, missingId: false }, write: { connected: true, login: "owner", last4: null } }) as unknown as Parameters<typeof AgentsViewScreen>[0];
beforeEach(() => {
  vi.clearAllMocks(); h.slots = []; h.effects = []; h.search = new URLSearchParams(); h.live = {};
  h.inspector.mockResolvedValue(inspector); h.trace.mockResolvedValue({ run: run(), agentName: "Projects", steps: [] });
  h.save.mockImplementation(async (id, edited) => ({ ok: true, approval: approval(id, { edited }) }));
  h.approve.mockResolvedValue({ ok: true });
  h.gmail.mockResolvedValue({ ok: true, gmailDraftId: "draft" });
  h.cancel.mockResolvedValue({ ok: true }); h.retry.mockResolvedValue({ ok: true, runId: "retry" }); h.model.mockResolvedValue({ ok: true });
  vi.stubGlobal("window", { location: { search: "" }, history: { replaceState: vi.fn() } });
  vi.stubGlobal("document", { getElementById: () => null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Phase 12 Agents regressions", () => {
  it("follows mounted URL changes and hides an obsolete trace immediately", async () => {
    const p = props(); h.search = new URLSearchParams("run=r");
    render(() => AgentsViewScreen(p)); await effects();
    expect(find(render(() => AgentsViewScreen(p)), "RunPanel").props.trace.run.id).toBe("r");
    h.search = new URLSearchParams("id=projects");
    expect(find(render(() => AgentsViewScreen(p)), "RunPanel")).toBeUndefined();
    h.search = new URLSearchParams("id=outreach"); p.agents.push({ ...agent, id: "outreach", name: "Outreach" });
    expect(find(render(() => AgentsViewScreen(p)), "AgentPanel").props.agent.id).toBe("outreach");
  });
  it("reloads an open trace on live events and refreshes the inspector after config changes", async () => {
    vi.useFakeTimers(); h.search = new URLSearchParams("run=r"); const p = props();
    render(() => AgentsViewScreen(p)); await effects(); render(() => AgentsViewScreen(p));
    h.live.run!(run()); await vi.advanceTimersByTimeAsync(600);
    expect(h.trace).toHaveBeenCalledTimes(2);
    h.search = new URLSearchParams();
    const panel = find(render(() => AgentsViewScreen(p)), "AgentPanel");
    panel.props.onDecided(); await Promise.resolve();
    expect(h.inspector).toHaveBeenLastCalledWith("projects");
  });
  it("offers full-review proposals only Review and Reject; keeps paid domain models editable", async () => {
    const original = find(render(() => AgentsViewScreen(props())), "AgentPanel");
    const panel = { ...original, props: { ...original.props } }; h.slots = [];
    panel.props.ins = { ...inspector, pending: approval("a", { kind: "finance_update", tool: "finance.update", original: {} }) };
    const tree = render(() => invoke(panel));
    expect(nodes(tree).some((e) => e.props.children === "Approve")).toBe(false);
    expect(nodes(tree).find((e) => e.props.children === "Review in Approvals")?.props.variant).toBe("primary");
    const radios = nodes(tree).filter((e) => e.props.role === "radio");
    expect(radios.map((e) => e.props.children)).toEqual(["Haiku", "Sonnet", "Opus"]);
    await radios[2]!.props.onClick(); expect(h.model).toHaveBeenCalledWith("projects", MODELS.opus);
    panel.props.agent = { ...agent, id: "orchestrator" }; h.slots = [];
    expect(nodes(render(() => invoke(panel))).filter((e) => e.props.role === "radio")).toHaveLength(0);
  });
  it.each(["running", "queued", "waiting_approval", "failed", "cancelled", "expired", "completed"] as const)("offers the correct run control for %s", async (status) => {
    h.search = new URLSearchParams("run=r"); const p = props(); p.initialTrace = { run: run(status), agentName: "Projects", steps: [], agent: null, toolCalls: [] } as typeof p.initialTrace;
    const panel = find(render(() => AgentsViewScreen(p)), "RunPanel"); h.slots = [];
    const controls = nodes(render(() => invoke(panel))).filter((e) => ["Retry", "Cancel run"].includes(e.props.children));
    expect(controls.map((e) => e.props.children)).toEqual(status === "completed" ? [] : [["failed", "cancelled", "expired"].includes(status) ? "Retry" : "Cancel run"]);
    if (controls[0]) { await controls[0].props.onClick(); expect(status === "failed" || status === "cancelled" || status === "expired" ? h.retry : h.cancel).toHaveBeenCalledWith("r"); }
  });
  it("keeps a tab stop at the first live desk when selection is absent", () => {
    const original = find(render(() => AgentsViewScreen(props())), "Office");
    const office = { ...original, props: { ...original.props, sel: "offline" } }; h.slots = [];
    expect(nodes(render(() => invoke(office))).find((e) => e.props["data-agent-spot"] === "projects")?.props.tabIndex).toBe(0);
  });
});

describe("Phase 12 Approvals regressions", () => {
  it("handles a new requested approval with unchanged counts, then preserves selection on row reconciliation", () => {
    const a = approval(), b = approval("b");
    const p = { initialPending: [a, b], initialResolved: [], initialSelected: a, missingId: false, write: props().write };
    render(() => ApprovalsInbox(p));
    p.initialSelected = b; render(() => ApprovalsInbox(p));
    expect(find(render(() => ApprovalsInbox(p)), "ApprovalDetail").props.approval.id).toBe("b");
    p.initialPending = [approval("new"), a, b]; render(() => ApprovalsInbox(p));
    const detail = find(render(() => ApprovalsInbox(p)), "ApprovalDetail");
    expect(detail.props.approval.id).toBe("b"); expect(detail.key).toBe("b");
    h.slots = [];
    expect(find(render(() => AgentsViewScreen({ ...props(), view: "approvals" })), "ApprovalsInbox").key).toBeNull();
  });
  it("saves issue edits without approving, and reports validation errors", async () => {
    let a = approval(); const p = { approval: a, write: props().write, onChange: (next: ApprovalDTO) => { a = next; p.approval = next; } };
    const child = ApprovalDetail(p); render(() => invoke(child));
    h.slots[0] = { title: "Edited", body: "Body", labels: "" };
    let tree = render(() => invoke(ApprovalDetail(p)));
    await find(tree, "Decision").props.onSave(); await settle();
    expect(h.save).toHaveBeenCalledWith("a", { ...issue, title: "Edited" }); expect(h.approve).not.toHaveBeenCalled();
    h.slots[0] = { title: "", body: "Body", labels: "" }; tree = render(() => invoke(ApprovalDetail(p)));
    find(tree, "Decision").props.onSave(); expect(h.save).toHaveBeenCalledTimes(1);
  });
  it.each(["event_create", "event_update"] as const)("saves %s edits without changing the calendar", async (kind) => {
    const event = { calendarId: "11111111-1111-4111-8111-111111111111", calendarLabel: "Home", provider: "google", eventId: "22222222-2222-4222-8222-222222222222", etag: null, scope: "this", instanceStart: null, title: "Meeting", start: "2026-10-23T00:00:00Z", end: "2026-10-23T01:00:00Z", allDay: false };
    const p = { approval: approval("a", { kind, tool: kind === "event_create" ? "calendar.create_event" : "calendar.update_event", original: { ...event, before: { ...event, location: "", description: "", showAs: "busy" } } }), write: props().write, onChange: vi.fn() };
    render(() => invoke(ApprovalDetail(p)));
    h.slots[0] = { ...(h.slots[0] as object), title: "Edited meeting" };
    find(render(() => invoke(ApprovalDetail(p))), "Decision").props.onSave(); await settle();
    expect(h.save).toHaveBeenCalledWith("a", expect.objectContaining({ calendarId: event.calendarId, title: "Edited meeting", start: new Date(event.start).toISOString() }));
    expect(h.approve).not.toHaveBeenCalled();
  });
  it("can save mail edits, then create a Gmail draft and approve further edits", async () => {
    const mail = { messageId: "00000000-0000-4000-8000-000000000001", threadId: "t1", to: [{ name: "Lee", address: "lee@example.org" }], cc: [], inReplyTo: "<a@b>", references: null, originalSubject: "Agenda", subject: "Re: Agenda", body: "Friday works." };
    const p = { approval: approval("a", { kind: "mail_reply", tool: "mail.send_reply", original: mail }), write: props().write, onChange: (a: ApprovalDTO) => { p.approval = a; } };
    h.save.mockImplementation(async (id, edited) => ({ ok: true, approval: { ...p.approval, id, edited } }));
    render(() => invoke(ApprovalDetail(p))); h.slots[0] = { subject: mail.subject, body: "Saturday works." };
    await find(render(() => invoke(ApprovalDetail(p))), "Decision").props.onSave(); await settle();
    expect(h.approve).not.toHaveBeenCalled();
    const decision = find(render(() => invoke(ApprovalDetail(p))), "Decision");
    expect(decision.props.extra.props.disabled).toBe(false);
    await decision.props.onApprove(); await settle(); expect(h.approve).toHaveBeenCalledWith("a", undefined);
    await decision.props.extra.props.onClick(); await settle(); expect(h.gmail).toHaveBeenCalledWith("a");
  });
});
