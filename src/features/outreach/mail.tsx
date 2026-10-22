"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ApprovalDTO } from "@/lib/agent-types";
import type { MailStatus } from "@/lib/outreach-types";
import type { outreachMailboxes } from "@/server/outreach-view";
import { addMailTaskAction, archiveMailAction, flagMailAction, getMailBodyAction, syncMailNowAction, triageMailAction } from "@/server/mail-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink, IconButton } from "@/ui/button";
import { SearchField, Segmented, TextArea } from "@/ui/controls";
import { Avatar, Status, Tag } from "@/ui/display";
import { Alert, EmptyState, PageState, Skeleton } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import { DraftReply } from "./draft-reply";
import { dateShort, hhmm, sydneyYmd } from "./fmt";
import { gmailThread } from "./model";
import s from "./outreach.module.css";

export type Mailboxes = Awaited<ReturnType<typeof outreachMailboxes>>;
export type MailItem = Mailboxes["items"][number];
export type MailAccount = Mailboxes["accounts"][number];
export type MailData = Mailboxes & { status: MailStatus; selectedId: string | null; approval: ApprovalDTO | null; autoDraft: boolean; missing: boolean };
export const ACCOUNT_COLORS = ["var(--status-working)", "var(--accent)", "var(--status-merged)"];
export function mailTime(iso: string, now: number) { return sydneyYmd(iso) === sydneyYmd(new Date(now).toISOString()) ? hhmm(iso) : now - Date.parse(iso) < 6 * 86400000 ? dateShort(iso).split(" ")[0] : dateShort(iso).split(" ").slice(1).join(" "); }
export const senderOf = (m: Pick<MailItem, "from">) => m.from.name || m.from.address || "Unknown sender";
export const accountColor = (accounts: MailAccount[], id: string) => ACCOUNT_COLORS[Math.max(0, accounts.findIndex((a) => a.id === id)) % ACCOUNT_COLORS.length]!;

type Nav = (patch: Record<string, string | null>) => void;
export function Mail({ data, box, label, navigate, menu, chips, onCompose, requestedId, readOverrides, setReadOverrides }: { data: MailData; box: string; label: string; navigate: Nav; menu: React.ReactNode; chips: React.ReactNode; onCompose: () => void; requestedId: string | null; readOverrides: Record<string, boolean>; setReadOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const router = useRouter();
  const { toast, openAI } = useShell();
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState("all");
  const [now] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);
  const [replySignal, setReplySignal] = useState(0);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const unread = (m: MailItem) => readOverrides[m.id] ?? m.unread;
  const rows = data.items.filter((m) => (unreadOnly !== "unread" || unread(m) || m.id === data.selectedId) && [m.subject, senderOf(m), m.snippet].join(" ").toLowerCase().includes(q.toLowerCase()));
  const selected = data.items.find((m) => m.id === data.selectedId) ?? null;
  const idx = rows.findIndex((m) => m.id === selected?.id);
  const account = data.accounts.find((a) => a.id === box);
  const selectedAccount = data.accounts.find((a) => a.id === selected?.connectionId);
  const disconnected = !["ok", "first_sync"].includes(data.status.state);
  const select = (id: string | null) => {
    setReplySignal(0);
    if (id) setReadOverrides((r) => ({ ...r, [id]: false }));
    navigate({ tab: "mail", mail: id, draft: null });
  };
  const archive = async () => {
    if (!selected) return;
    const r = await archiveMailAction(selected.id, !selected.archivedAt).catch(() => ({ ok: false }));
    if (!r.ok) return toast("Couldn't save that. Try again.", "error");
    toast(selected.archivedAt ? "Moved back to inbox" : "Archived in LifeOS. Gmail is unchanged.");
    select(rows[idx + 1]?.id ?? rows[idx - 1]?.id ?? null); router.refresh();
  };
  const flag = async () => {
    if (!selected) return;
    const r = await flagMailAction(selected.id, !selected.flaggedAt).catch(() => ({ ok: false }));
    toast(r.ok ? selected.flaggedAt ? "Unflagged" : "Flagged" : "Couldn't save that. Try again.", r.ok ? "success" : "error"); router.refresh();
  };
  // shortcut: read/unread is local to this screen, upgrade when an existing server action supports Gmail read state.
  const toggleRead = () => { if (selected) setReadOverrides((r) => ({ ...r, [selected.id]: !unread(selected) })); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
    const k = e.key.toLowerCase();
    const d = k === "arrowdown" || k === "j" ? 1 : k === "arrowup" || k === "k" ? -1 : 0;
    if (d) { const target = rows[idx < 0 ? 0 : idx + d]; if (target) { e.preventDefault(); refs.current.get(target.id)?.focus(); select(target.id); } }
    else if (k === "e" || k === "s" || k === "u" || k === "r") { e.preventDefault(); if (k === "e") void archive(); else if (k === "s") void flag(); else if (k === "u") toggleRead(); else setReplySignal((n) => n + 1); }
  };
  const sync = async () => { if (syncing) return; setSyncing(true); const r = await syncMailNowAction().catch(() => ({ ok: false })); setSyncing(false); toast(r.ok ? "Sync started" : "Couldn't start sync. Try again.", r.ok ? "success" : "error"); };
  return <div className={s.mailPanes} onKeyDown={onKey} data-reading={!!requestedId}>
    <section className={s.messageList} aria-label="Messages"><div className={s.listHead}>
      <div className={s.listTitle}>{menu}<div><h2>{label}</h2><p className={s.meta}>{account ? `${account.email ?? "Gmail"} · ${account.lastSyncAt ? `Synced ${dateShort(account.lastSyncAt)} ${hhmm(account.lastSyncAt)}` : "Awaiting sync"} · ` : ""}{data.items.length} messages · {data.items.filter(unread).length} unread</p></div><IconButton icon="edit_square" label="New message" onClick={onCompose} /></div>
      <SearchField label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={s.actions}><Segmented small label="Show mail" value={unreadOnly} onChange={setUnreadOnly} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} /><IconButton icon="sync" label="Sync mail now" small disabled={syncing} onClick={() => void sync()} /></div><p className={s.keyHint}>↑↓ · J K · E ARCHIVE · S FLAG · U UNREAD · R REPLY</p>{chips}
    </div>
      {account?.status === "error" && <Alert action={<ButtonLink size="sm" href="/settings?section=connections">Reconnect</ButtonLink>}>{account.email} is signed out. Showing the last synced mail.</Alert>}
      {data.status.lastSyncError && <Alert>Mail sync failed: {data.status.lastSyncError}</Alert>}
      {data.status.triagePaused && <Alert tone="warn">Triage is paused at the monthly AI cap. Existing mail is still available.</Alert>}
      {data.missing && <Alert>This message is unavailable. It may have been removed.</Alert>}
      {disconnected && !data.items.length ? <PageState inline kind="disconnected" agent="outreach" title="Connect mail to use Outreach" body={data.status.state === "scope_missing" ? "Reconnect Google and allow Gmail. Events work without mail." : "Connect or reconnect Gmail. Events work without mail."} action={{ label: "Reconnect Gmail", href: "/settings?section=connections" }} /> : data.status.state === "first_sync" ? <EmptyState title="Syncing your inbox" body="The last 30 days of mail are coming in. This can take a minute." /> : <div className={s.mailRows} role="listbox" aria-label={`${label} messages`}>
        {rows.map((m, i) => <button ref={(el) => { if (el) refs.current.set(m.id, el); else refs.current.delete(m.id); }} type="button" role="option" aria-selected={m.id === selected?.id} tabIndex={m.id === selected?.id || (idx < 0 && i === 0) ? 0 : -1} className={s.mailRow} key={m.id} onClick={() => select(m.id)} data-unread={unread(m)}>
          <span className={s.unreadDot} aria-label={unread(m) ? "Unread" : "Read"} /><span className={s.mailRowBody}><span className={s.rowTop}><strong>{senderOf(m)}</strong><span className={s.meta}>{m.flaggedAt && <Icon name="flag" size={15} fill />}{mailTime(m.receivedAt, now)}</span></span><span className={s.subject}>{m.subject || "(no subject)"}</span><span className={s.snippet}>{m.summary ?? m.snippet}</span><span className={s.rowBottom}><span className={s.dot} style={{ background: accountColor(data.accounts, m.connectionId) }} /><span>{m.mailbox ?? "Gmail"}</span><span>{m.category ?? "UNTRIAGED"}</span>{m.replyState === "pending" ? <Status tone="approval" glyph="!">Reply awaiting approval</Status> : m.replyState === "executed" ? <Status tone="working" glyph="✓">Replied</Status> : m.replyState === "rejected" ? <Tag>Draft rejected</Tag> : null}</span></span>
        </button>)}{rows.length === 0 && <EmptyState icon="inbox" title={q ? "No matching messages" : unreadOnly === "unread" ? "No unread mail here" : "Inbox zero"} body="Try another mailbox or filter." />}
      </div>}
    </section>
    <article className={s.readPane} aria-label="Message"><div className={s.messageToolbar}>
      <Button className={s.mobileBack} variant="text" icon="chevron_left" onClick={() => select(null)}>Back</Button>
      {selected && <><IconButton icon="archive" label={selected.archivedAt ? "Unarchive (E)" : "Archive (E)"} onClick={() => void archive()} /><IconButton icon="flag" fill={!!selected.flaggedAt} aria-pressed={!!selected.flaggedAt} label="Flag (S)" onClick={() => void flag()} /><IconButton icon="mark_email_unread" label="Toggle unread (U)" onClick={toggleRead} /><IconButton icon="person_check" label="Follow up · see action items" onClick={() => document.getElementById(`mail-actions-${selected.id}`)?.scrollIntoView({ block: "center" })} />{selected.category === "EVENTS" && <IconButton icon="event" label="Ask Organization to add this event to calendar" onClick={() => openAI(`Read email ${selected.id} and ask Organization to propose adding its event to my calendar. Wait for my approval before creating it.`)} />}<span className={s.position}>{idx >= 0 ? `${idx + 1} of ${rows.length}` : ""}</span><IconButton icon="keyboard_arrow_up" label="Previous message" disabled={idx <= 0} onClick={() => select(rows[idx - 1]!.id)} /><IconButton icon="keyboard_arrow_down" label="Next message" disabled={idx < 0 || idx >= rows.length - 1} onClick={() => select(rows[idx + 1]!.id)} /></>}
    </div>{selected ? <MailDetail key={selected.id} mail={selected} account={selectedAccount} color={accountColor(data.accounts, selected.connectionId)} approval={data.approval} paused={data.status.triagePaused} autoDraft={data.autoDraft} onAutoDrafted={() => navigate({ draft: null })} replySignal={replySignal} /> : <EmptyState title="No message selected" />}</article>
  </div>;
}

type Body = { st: "loading" } | { st: "error" } | { st: "ok"; text: string; htmlOnly: boolean; truncated: boolean; threadId: string };
function MailDetail({ mail: m, account, color, approval, paused, autoDraft, onAutoDrafted, replySignal }: { mail: MailItem; account?: MailAccount; color: string; approval: ApprovalDTO | null; paused: boolean; autoDraft: boolean; onAutoDrafted: () => void; replySignal: number }) {
  const router = useRouter();
  const { toast } = useShell();
  const [body, setBody] = useState<Body>({ st: "loading" });
  const [tries, setTries] = useState(0);
  const [added, setAdded] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [reply, setReply] = useState("");
  const replyRef = useRef<HTMLDivElement>(null);
  const disabled = account?.status === "error" || !account?.compose;
  const thread = gmailThread(m.mailbox, body.st === "ok" ? body.threadId : m.threadId);
  const compose = `https://mail.google.com/mail/?authuser=${encodeURIComponent(m.mailbox ?? "")}&view=cm&fs=1&to=${encodeURIComponent(m.from.address)}&su=${encodeURIComponent(`Re: ${m.subject}`)}&body=${encodeURIComponent(reply)}`;
  useEffect(() => {
    if (!replySignal || disabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keyboard command opens this message's reply editor
    setComposing(true);
  }, [replySignal, disabled]);
  useEffect(() => { if (composing) replyRef.current?.querySelector("textarea")?.focus(); }, [composing]);
  useEffect(() => {
    let live = true;
    void getMailBodyAction(m.id).then((r) => { if (live) setBody(r.ok && "text" in r ? { st: "ok", text: r.text, htmlOnly: r.htmlOnly, truncated: r.truncated, threadId: r.threadId } : { st: "error" }); }).catch(() => { if (live) setBody({ st: "error" }); });
    return () => { live = false; };
  }, [m.id, tries]);
  const action = async (key: string, fn: () => Promise<{ ok: boolean }>) => {
    if (busy) return;
    setBusy(key); const r = await fn().catch(() => ({ ok: false })); setBusy(null);
    if (!r.ok) { toast("Couldn't save that. Try again.", "error"); return false; }
    router.refresh(); return true;
  };
  return <div className={s.readScroll}><div className={s.readContent}>
    {account?.status === "error" && <Alert action={<ButtonLink href="/settings?section=connections">Reconnect</ButtonLink>}>{account.email} is signed out. Replies are paused until it is reconnected.</Alert>}
    <div className={s.tags}><Tag variant="source">{m.category ?? "UNTRIAGED"}</Tag>{m.importance && <Status tone={m.importance === "HIGH" ? "failed" : "idle"} glyph={m.importance === "HIGH" ? "!" : "–"}>{m.importance} importance</Status>}</div>
    <h2 className={s.messageTitle}>{m.subject || "(no subject)"}</h2>
    <div className={s.sender}><Avatar name={senderOf(m)} size={30} /><div><strong>{senderOf(m)}</strong> <span className={s.small}>&lt;{m.from.address}&gt;</span><div className={s.meta}>to <span className={s.dot} style={{ background: color }} /> {m.mailbox ?? m.to.map((x) => x.address).join(", ")}{m.cc.length > 0 && ` · cc ${m.cc.map((x) => x.address).join(", ")}`}</div></div><time className={s.meta}>{dateShort(m.receivedAt)} {hhmm(m.receivedAt)}</time></div>
    <section className={s.summary} aria-label="AI summary"><div className={s.label}><Icon name="auto_awesome" size={17} />Summary · Outreach agent</div><p>{m.bulk ? "Bulk or promotional mail. Not sent to the AI." : m.summary ?? "Not triaged yet."}</p>{!m.bulk && !m.triagedAt && <Button size="sm" disabled={paused || !!busy} onClick={() => void action("triage", () => triageMailAction(m.id)).then((ok) => { if (ok) toast("Triage started"); })}>Triage</Button>}
      <div id={`mail-actions-${m.id}`} className={s.stack}>{m.actionItems.map((it, i) => <div key={i} className={s.actionItem}><span>{it.text}{it.due && <span className={s.meta}> · due {it.due}</span>}</span><Button size="sm" variant="text" disabled={added.includes(i) || !!busy} onClick={() => void action(`task-${i}`, () => addMailTaskAction(m.id, i)).then((ok) => { if (ok) { setAdded((a) => [...a, i]); toast("Task added"); } })}>{added.includes(i) ? "✓ Task added" : "Add as task"}</Button></div>)}{!m.actionItems.length && <p className={s.meta}>No action items.</p>}</div>
    </section>
    {body.st === "loading" ? <div role="status" aria-label="Loading message" className={s.stack}><Skeleton /><Skeleton /><Skeleton w="70%" /></div> : body.st === "error" ? <Alert action={<Button onClick={() => { setBody({ st: "loading" }); setTries((n) => n + 1); }}>Try again</Button>}>Couldn&apos;t load the message from Gmail. Check the connection in Settings.</Alert> : <><div role="region" aria-label="Message body" tabIndex={0} className={s.messageBody}>{body.text || m.snippet}</div>{body.htmlOnly && <p className={s.meta}>Shown as plain text. Images and formatting are not loaded.</p>}{body.truncated && <p className={s.meta}>Message is long; showing the first part.</p>}</>}
    <div className={s.actions}><span className={s.meta}>Full message loads live from Gmail; bodies are never stored.</span>{thread && <ButtonLink href={thread} external variant="text" size="sm">Open in Gmail ↗</ButtonLink>}</div>
    <DraftReply mailId={m.id} approval={approval} capReached={paused} disabled={disabled} autoDraft={autoDraft} onAutoDrafted={onAutoDrafted} />
    {composing && <div ref={replyRef} className={s.summary}><span className={s.meta}>From {m.mailbox ?? "the receiving account"}</span><TextArea label="Reply" rows={6} maxLength={10000} value={reply} onChange={(e) => setReply(e.target.value)} /><div className={s.actions}><ButtonLink href={compose} external variant="primary">Continue in Gmail</ButtonLink><Button variant="ghost" onClick={() => setComposing(false)}>Cancel</Button></div><p className={s.meta}>Gmail saves your work as a draft after you open its composer.</p></div>}
    <div className={s.actions}>{disabled ? <p className={s.meta}>Replies are paused until Gmail is reconnected with compose access.</p> : <Button icon="reply" variant="primary" onClick={() => setComposing(true)}>Reply</Button>}<span className={s.meta}>From {m.mailbox ?? "the receiving account"}</span></div>
  </div></div>;
}
