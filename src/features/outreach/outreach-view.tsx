"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FollowUpDTO, OutreachEventDTO } from "@/lib/outreach-types";
import { MAIL_CATEGORIES } from "@/lib/outreach-types";
import type { SourceStatus } from "@/server/outreach/queries";
import { syncEventsNowAction } from "@/server/outreach-actions";
import { toggleTaskAction } from "@/server/task-actions";
import { useLiveEvents } from "@/features/shell/live-provider";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink, IconButton } from "@/ui/button";
import { FilterChip, SearchField, Segmented, Select, SelectField, TogglePill } from "@/ui/controls";
import { Alert, EmptyState } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { PageHeader } from "@/ui/layout";
import { Dialog } from "@/ui/overlay";
import { ImportUrlDialog, type CalendarProps } from "./dialogs";
import { EventCard, Pipeline } from "./events";
import { Mail, accountColor, type MailData } from "./mail";
import { discoverEvents, DISCOVERY_CATEGORIES } from "./model";
import s from "./outreach.module.css";

export type { MailData } from "./mail";
type Props = CalendarProps & { events: OutreachEventDTO[]; pipeline: OutreachEventDTO[]; status: SourceStatus; interests: string[]; hideMock: boolean; mail: MailData | null; followUps: FollowUpDTO[] | null; followUpCount: number; now: string };
const boxLabel: Record<string, string> = { all: "All inboxes", flagged: "Flagged", reply: "Needs reply", archive: "Archive", archived: "Archive", important: "Important", events: "Event mail", networking: "Networking", opportunities: "Opportunities", "follow-up": "Follow-up mail", other: "Other", untriaged: "Untriaged" };

export function OutreachView({ events, pipeline, status, interests, calendars, defaultCalendarId, hideMock, mail, followUps, followUpCount, now }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useShell();
  const [side, setSide] = useState(false);
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const tab = sp.get("mail") ? "mail" : sp.get("tab") === "email" || sp.get("tab") === "mail" ? "mail" : sp.get("view") === "pipeline" ? "pipeline" : ["discover", "pipeline", "follow-ups"].includes(sp.get("tab") ?? "") ? sp.get("tab")! : sp.get("tab") === "events" ? "discover" : "mail";
  const box = sp.get("box") ?? sp.get("cat") ?? "all";
  const navigate = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) { if (v === null) q.delete(k); else q.set(k, v); }
    router.replace(`/outreach${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  useLiveEvents("outreach", () => router.refresh());
  useLiveEvents("approval", () => router.refresh());
  useEffect(() => { sessionStorage.setItem("outreach:list", `/outreach${sp.size ? `?${sp}` : ""}`); }, [sp]);
  const importParam = sp.get("import");
  useEffect(() => {
    if (importParam !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot palette command, remove the consumed URL parameter
    setImporting(true);
    const q = new URLSearchParams(window.location.search); q.delete("import");
    router.replace(`/outreach${q.size ? `?${q}` : ""}`, { scroll: false });
  }, [importParam, router]);
  const go = (nextTab: string, nextBox = "all") => { navigate({ tab: nextTab, box: nextTab === "mail" ? nextBox : null, mail: null, draft: null, cat: null, view: null }); setSide(false); };
  const accounts = mail?.accounts ?? [];
  const selectedInterests = (sp.get("interest") ?? "").split(",").filter((i) => interests.includes(i));
  const category = DISCOVERY_CATEGORIES.find((c) => c.toLowerCase() === sp.get("cat")?.toLowerCase()) ?? "All";
  const filters = { q: sp.get("q") ?? "", when: sp.get("when") ?? "any", cat: category, free: sp.get("free") === "1", sort: sp.get("sort") ?? "score", interests: selectedInterests };
  const discovered = discoverEvents(events, filters, now);
  const clear = () => navigate({ when: null, cat: null, free: null, sort: null, q: null, interest: null });
  const sync = async () => { if (syncing) return; setSyncing(true); const r = await syncEventsNowAction().catch(() => ({ ok: false })); setSyncing(false); toast(r.ok ? "Sync started" : "Couldn't start sync. Try again.", r.ok ? "success" : "error"); };
  const title = tab === "discover" ? "Discover events" : tab === "pipeline" ? "Event pipeline" : "Follow-ups";
  const rows: { id: string; label: string; tab: string; icon: IconName; n?: number; account?: boolean }[] = [
    { id: "all", label: "All inboxes", tab: "mail", icon: "all_inbox", n: accounts.reduce((sum, a) => sum + a.unread, 0) },
    ...accounts.map((a) => ({ id: a.id, label: a.email ?? "Gmail", tab: "mail", icon: "inbox" as const, n: a.unread, account: true })),
    { id: "flagged", label: "Flagged", tab: "mail", icon: "flag" }, { id: "reply", label: "Needs reply", tab: "mail", icon: "reply" }, { id: "archive", label: "Archive", tab: "mail", icon: "archive" },
  ];
  const networking = [{ id: "discover", label: "Discover events", tab: "discover", icon: "travel_explore" as const }, { id: "pipeline", label: "Event pipeline", tab: "pipeline", icon: "view_kanban" as const, n: pipeline.length }, { id: "follow-ups", label: "Follow-ups", tab: "follow-ups", icon: "person_check" as const, n: followUpCount }];
  const navRows = (list: typeof rows) => list.map((r) => <button type="button" key={r.id} className={s.mailbox} aria-current={tab === r.tab && (r.tab !== "mail" || box === r.id) ? "page" : undefined} onClick={() => go(r.tab, r.id)}>
    {r.account ? <span className={s.dot} style={{ background: accountColor(accounts, r.id) }} /> : <Icon name={r.icon} size={18} />}<span className={s.mailboxText}>{r.label}{r.account && accounts.find((a) => a.id === r.id)?.status === "error" && <span className={s.signedOut}>× Signed out</span>}</span>{r.n !== undefined && <span className={s.meta}>{r.n}</span>}
  </button>);
  const sidebar = <div className={s.sideContent}><div className={s.sideHead}><h1>Outreach</h1><IconButton icon="edit_square" label="New message" small onClick={() => { setComposing(true); setSide(false); }} /></div><nav aria-label="Mailboxes"><h2 className={s.groupLabel}>Mailboxes</h2>{navRows(rows)}</nav><nav aria-label="Sorted by Outreach"><h2 className={s.groupLabel}>Sorted by Outreach</h2>{navRows([...MAIL_CATEGORIES.map((c) => ({ id: c.toLowerCase(), label: boxLabel[c.toLowerCase()]!, n: mail?.categoryCounts[c.toLowerCase()] ?? 0, tab: "mail", icon: "label" as const })), { id: "untriaged", label: "Untriaged", n: mail?.categoryCounts.untriaged ?? 0, tab: "mail", icon: "mail" }])}</nav><nav aria-label="Networking"><h2 className={s.groupLabel}>Networking</h2>{navRows(networking)}</nav><footer className={s.sideFooter}><p>{accounts.length} of 3 email accounts linked · <Link href="/settings?section=connections">Manage</Link></p><p>Triage reads new mail in batches of 10. Bulk mail is classified by rule and never sent to a model.</p></footer></div>;
  const menu = <IconButton className={s.tabletMenu} icon="menu" label="Mailboxes" onClick={() => setSide(true)} />;
  const chips = <nav className={s.mobileChips} aria-label="Mailboxes">{[...rows, ...networking].map((r) => <FilterChip key={r.id} selected={tab === r.tab && (r.tab !== "mail" || box === r.id)} onClick={() => go(r.tab, r.id)}>{r.label}</FilterChip>)}</nav>;
  return <div className={s.root} data-screen-label="Outreach"><aside className={s.sidebar} aria-label="Mailboxes">{sidebar}</aside>
    {side && <MailboxOverlay onClose={() => setSide(false)}>{sidebar}</MailboxOverlay>}
    {tab === "mail" ? mail ? <Mail key={box} data={mail} box={box} label={accounts.find((a) => a.id === box)?.email ?? boxLabel[box] ?? "All inboxes"} navigate={navigate} menu={menu} chips={chips} onCompose={() => setComposing(true)} requestedId={sp.get("mail")} readOverrides={readOverrides} setReadOverrides={setReadOverrides} /> : <div className={s.network}>{menu}{chips}<Alert action={<Button onClick={() => router.refresh()}>Try again</Button>}>Couldn&apos;t load email.</Alert></div> : <section className={s.network} aria-label={title}>
      <div className={s.networkHead}>{menu}<PageHeader title={title} sub={tab === "discover" ? "Events around Sydney in the next 30 days. Save the ones you like; they move into your pipeline." : tab === "pipeline" ? "Move events one stage at a time. Scores combine your keywords, past attendance and who’s going." : "People you said you’d get back to."} actions={tab !== "follow-ups" && <Button onClick={() => setImporting(true)}>Import event URL</Button>} /></div>{chips}
      {tab === "follow-ups" ? <FollowUps items={followUps} onDraft={(id) => navigate({ tab: "mail", box: "all", mail: id, draft: "1", cat: null })} /> : <>
        <div className={s.eventTools}><Button size="sm" icon="sync" disabled={syncing} onClick={() => void sync()}>Sync now</Button>{status.mockCount > 0 && <TogglePill pressed={hideMock} onChange={(v) => navigate({ mock: v ? "0" : "1" })} iconOff="visibility_off">Hide mock</TogglePill>}<ButtonLink href="/settings?section=outreach" variant="text" size="sm">Edit interests</ButtonLink>{interests.map((i) => <FilterChip key={i} selected={selectedInterests.includes(i)} onClick={() => navigate({ interest: (selectedInterests.includes(i) ? selectedInterests.filter((x) => x !== i) : [...selectedInterests, i]).join(",") || null })}>{i}</FilterChip>)}</div>
        {tab === "discover" && <><div className={s.discoverTools}><SearchField className={s.eventSearch} label="Search events" placeholder="Search events, venues, organisers" value={filters.q} onChange={(e) => navigate({ q: e.target.value || null })} /><Segmented label="When" small value={filters.when} onChange={(v) => navigate({ when: v })} options={[{ value: "any", label: "Any time" }, { value: "week", label: "This week" }, { value: "weekend", label: "This weekend" }, { value: "month", label: "Next 30 days" }]} /><TogglePill pressed={filters.free} onChange={(v) => navigate({ free: v ? "1" : null })}>Free only</TogglePill><Select label="Sort events" inlineLabel="Sort" value={filters.sort} onChange={(e) => navigate({ sort: e.target.value })}><option value="score">Best match</option><option value="date">Soonest</option><option value="popular" disabled>Most going ? unavailable</option></Select></div><div className={s.categoryChips}>{DISCOVERY_CATEGORIES.map((c) => <FilterChip key={c} selected={category === c} count={discovered.counts[c]} onClick={() => navigate({ cat: c === "All" ? null : c })}>{c}</FilterChip>)}</div></>}
        <div className={s.sourceStrip}><Icon name="travel_explore" size={18} /><span>{tab === "discover" ? `${discovered.items.length} of ${events.length} upcoming Sydney events, scored against your interests.` : `${pipeline.length} saved events.`} {status.hasRealSource ? "Sources: Connected feeds and imported URLs." : "Add an iCal feed or import an event URL to see real Sydney events."}</span><Link href="/settings?section=connections#event-feeds">Add a feed</Link></div>
        {status.failing.map((source) => <Alert key={source.label} action={<ButtonLink href="/settings?section=connections" variant="text">Open Settings</ButtonLink>}>{source.label} didn&apos;t sync: {source.lastSyncError}. Showing the last events we have.</Alert>)}
        {tab === "pipeline" ? <Pipeline events={[...pipeline, ...events.filter((e) => e.stage === null && !pipeline.some((p) => p.id === e.id))]} /> : discovered.items.length ? <div className={s.eventGrid}>{discovered.items.map((e) => <EventCard key={e.id} event={e} calendars={calendars} defaultCalendarId={defaultCalendarId} />)}</div> : <EmptyState icon="event_busy" title="No events match these filters." action={<Button onClick={clear}>Clear filters</Button>} />}
      </>}
    </section>}
    {importing && <ImportUrlDialog onClose={() => setImporting(false)} />}{composing && <Compose accounts={accounts} onClose={() => setComposing(false)} />}
  </div>;
}

function MailboxOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={s.mailboxOverlay} aria-label="Mailboxes" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div><IconButton icon="close" label="Close mailboxes" onClick={onClose} />{children}</div></dialog>;
}

function Compose({ accounts, onClose }: { accounts: NonNullable<Props["mail"]>["accounts"]; onClose: () => void }) {
  const [from, setFrom] = useState(accounts.find((a) => a.status !== "error" && a.compose)?.id ?? "");
  const account = accounts.find((a) => a.id === from);
  return <Dialog open title="New message" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button>{account && <ButtonLink external href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email ?? "")}&view=cm&fs=1`} variant="primary">Compose in Gmail</ButtonLink>}</>}><div className={s.stack}>{accounts.some((a) => a.compose && a.status !== "error") ? <><SelectField label="From account" value={from} onChange={(e) => setFrom(e.target.value)}>{accounts.filter((a) => a.compose && a.status !== "error").map((a) => <option key={a.id} value={a.id}>{a.email ?? "Gmail"}</option>)}</SelectField><p>Finish your message in this account’s Gmail composer. Gmail saves your work as a draft.</p></> : <EmptyState title="Connect Gmail to compose" action={<ButtonLink href="/settings?section=connections">Open Connections</ButtonLink>} />}</div></Dialog>;
}

function FollowUps({ items, onDraft }: { items: FollowUpDTO[] | null; onDraft: (id: string) => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const complete = async (id: string) => { if (busy) return; setBusy(id); const r = await toggleTaskAction(id, true).catch(() => ({ ok: false })); setBusy(null); if (!r.ok) return toast("Couldn't update. Try again.", "error"); setGone((g) => [...g, id]); toast("Follow-up completed"); router.refresh(); };
  if (!items) return <Alert action={<Button onClick={() => router.refresh()}>Try again</Button>}>Couldn&apos;t load follow-ups.</Alert>;
  const rows = items.filter((t) => !gone.includes(t.id));
  return <div className={s.followUps}>{rows.map((t) => <div key={t.id} className={s.followRow}><div><strong>{t.title}</strong><p className={s.small}><Link href={t.context.kind === "event" ? `/outreach/events/${t.context.id}` : `/outreach?tab=mail&mail=${t.context.id}`}>{t.context.kind === "event" ? t.context.title : `${t.context.subject} · ${t.context.sender}`}</Link> · {t.dueDate ?? "No due date"}</p></div><div className={s.actions}>{t.context.kind === "email" ? <Button size="sm" onClick={() => onDraft(t.context.id)}>Draft with Outreach</Button> : <ButtonLink size="sm" href={`/outreach/events/${t.context.id}`}>Open event</ButtonLink>}<Button variant="primary" size="sm" disabled={!!busy} onClick={() => void complete(t.id)}>Done</Button></div></div>)}{!rows.length && <EmptyState title="No follow-ups due." body="Follow up on an attended event, or add an email action item as a task." />}</div>;
}
