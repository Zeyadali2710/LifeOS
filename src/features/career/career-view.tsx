"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CareerDTO } from "@/lib/project-types";
import type { CareerViewData } from "@/server/career-view";
import { syncNowAction } from "@/server/settings-actions";
import { sydneyYmd } from "@/lib/project-rules";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink } from "@/ui/button";
import { Checkbox, SearchField, Segmented, Select } from "@/ui/controls";
import { Alert, EmptyState, PageState } from "@/ui/feedback";
import { Card, Page, PageHeader } from "@/ui/layout";
import { Icon } from "@/ui/icon";
import type { IconName } from "@/ui/icon-names";
import { Bars, CiStatus, GithubLink } from "./components";
import { contributionDays, relativeTime, repoPath, weeklyCommits } from "./model";
import s from "./career.module.css";

const levels = ["var(--wash)", "var(--status-working-bg)", "var(--status-working)"];

export function CareerView({ data, extra, now }: { data: CareerDTO; extra: CareerViewData; now: string }) {
  const router = useRouter();
  const { toast, openAI } = useShell();
  const [syncing, setSyncing] = useState(false);
  const [allActivity, setAllActivity] = useState(false);
  const [archived, setArchived] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [heatRepo, setHeatRepo] = useState("all");
  const [focused, setFocused] = useState<number | null>(null);
  const visible = data.repos.filter((r) => archived || !r.archived);
  const matches = (ci: string, prs: number) => filter === "failing" ? ci === "failing" : filter === "prs" ? prs > 0 : true;
  const repos = visible.filter((r) => matches(r.ci, r.openPrs) && `${r.fullName} ${r.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const days = contributionDays(extra.contributions, now, heatRepo === "all" ? undefined : Number(heatRepo));
  const total = days.reduce((n, d) => n + (d.future ? 0 : d.count), 0);
  const days30 = contributionDays(extra.contributions, now).filter((d) => !d.future && Date.parse(d.date) >= Date.parse(sydneyYmd(new Date(now))) - 29 * 86_400_000);
  let streak = 0, longest = 0;
  const months = new Map<string, number>();
  for (const day of days) {
    if (day.future) continue;
    streak = day.count ? streak + 1 : 0;
    longest = Math.max(longest, streak);
    const month = day.date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + day.count);
  }
  const busiest = [...months].sort((a, b) => b[1] - a[1])[0];
  const groups = new Map<string, CareerDTO["activity"]>();
  for (const item of data.activity.slice(0, allActivity ? data.activity.length : 6)) {
    const day = sydneyYmd(new Date(item.at));
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  async function sync() {
    setSyncing(true);
    try {
      const result = await syncNowAction();
      if (result.ok) { toast("GitHub sync queued."); router.refresh(); }
      else toast("Couldn't sync. Try again.", "error");
    } catch { toast("Couldn't sync. Try again.", "error"); }
    finally { setSyncing(false); }
  }
  const kpis: { icon: IconName; label: string; value: string | number; sub: string }[] = [
    { icon: "commit", label: "Commits", value: days30.reduce((n, d) => n + d.count, 0), sub: "last 30 days · synced commits" },
    { icon: "merge", label: "PRs merged", value: extra.merged30, sub: `last 30 days · ${data.tiles.openPrs} open` },
    { icon: "event_available", label: "Active days", value: days30.filter((d) => d.count > 0).length, sub: "of the last 30 days · synced commits" },
    { icon: "verified_user", label: "CI pass rate", value: extra.passRate === null ? "—" : `${extra.passRate}%`, sub: `last 30 days · ${data.tiles.ciFailing} failing repositories` },
  ];
  return <Page label="Career" className={s.page}>
    <PageHeader title="Career" sub={<>GitHub · {visible.length} repositories · {data.tiles.openPrs} open PRs · {data.tiles.openIssues} your open issues · {data.tiles.ciFailing} CI failures · synced {relativeTime(data.connection.lastSyncAt, now)} · read-only</>}
      actions={<><ButtonLink href="/projects" variant="text">View projects</ButtonLink><Checkbox label="Show archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} /><Button icon="sync" disabled={syncing} onClick={() => void sync()}>{syncing ? "Syncing…" : "Sync now"}</Button></>} />
    {data.connection.status === "error" && <Alert action={<Link href="/settings?section=connections">Check GitHub connection</Link>}>GitHub sync failed: {data.connection.lastSyncError}. Showing the last data we have.</Alert>}
    {data.repos.length === 0 ? <PageState inline kind="empty" agent="projects" title="No repositories synced yet" body="Your first sync may still be running. Use Sync now, or check that your token can see the repositories you expect." action={{ label: "Sync now", onClick: () => void sync() }} /> : <>
      <div className={s.kpis}>{kpis.map((k) => <Card key={k.label} className={s.kpi}><div className={s.row}><span className={s.chip}><Icon name={k.icon} size={18} /></span><span>{k.label}</span></div><div className={s.big}>{k.value}</div><p className={s.small}>{k.sub}</p></Card>)}</div>
      <div className={s.listTop}>
        <Card as="section" className={`${s.panel} ${s.heatPanel}`} labelledBy="career-contributions">
          <div className={s.between}><div><h2 id="career-contributions" className={s.h2}>{total.toLocaleString()} synced commits in the last year</h2><p className={s.small}>Stored commit history · {heatRepo === "all" ? "all repositories" : data.repos.find((r) => r.id === Number(heatRepo))?.name}</p></div><Select label="Contribution repository" value={heatRepo} onChange={(e) => setHeatRepo(e.target.value)}><option value="all">All repositories</option>{data.repos.map((r) => <option key={r.id} value={r.id}>{r.fullName}</option>)}</Select></div>
          <div className={s.scroll}><div className={s.heat}><span /><div className={s.months}>{days.flatMap((d, i) => i % 7 === 0 && Number(d.date.slice(8)) <= 7 ? <span key={d.date} style={{ gridColumn: `${Math.floor(i / 7) + 1} / span 1` }}>{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}</span> : [])}</div><div className={s.weekdays}><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div><div className={s.heatCells} role="img" aria-label={`${total} synced commits over the last year. ${longest} day longest streak. Empty days may reflect history that has not synced.`}>{days.map((d) => <span key={d.date} className={s.heatCell} title={`${d.date}: ${d.future ? "future" : `${d.count} commits`}`} style={{ background: d.future ? "transparent" : levels[d.count === 0 ? 0 : d.count < 4 ? 1 : 2] }} />)}</div></div></div>
          <div className={s.between}><p className={s.small}>Longest streak <strong>{longest} days</strong> · Most active <strong>{busiest && busiest[1] ? new Date(`${busiest[0]}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" }) : "—"}</strong></p><span className={s.legend}>Less {levels.map((bg) => <span key={bg} className={s.legendDot} style={{ background: bg }} />)} More</span></div>
        </Card>
        <Card as="section" labelledBy="career-activity" className={`${s.panel} ${s.activityPanel}`}><div className={s.row}><span className={s.chip}><Icon name="bolt" size={19} /></span><div><h2 id="career-activity" className={s.h2}>Latest activity</h2><p className={s.small}>All repositories</p></div></div>
          {groups.size === 0 && <p className={s.small}>No GitHub activity yet.</p>}
          {[...groups].map(([day, items]) => <div key={day}><h3 className={s.groupLabel}>{day === sydneyYmd(new Date(now)) ? "Today · " : ""}{new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</h3><ul className={s.list}>{items.map((item) => <li key={item.id} className={s.activity}><span className={s.chip}><Icon size={16} name={item.kind === "ci" ? "play_circle" : item.kind === "pr" ? "alt_route" : item.kind === "issue" ? "bug_report" : "commit"} /></span><div className={s.activityBody}><GithubLink url={item.href}>{item.title}</GithubLink><div className={s.small}>{item.repo && <Link href={repoPath(item.repo)}>{item.repo}</Link>} {item.actor && `· ${item.actor}`} · {relativeTime(item.at, now)}</div>{item.ci && <CiStatus ci={item.ci} />}{item.ci === "failing" && <Button variant="text" onClick={() => openAI(`Ask Projects to draft an issue for the failing CI run in ${item.repo}. Run: ${item.title}. Prepare a proposal for my approval.`)}>Draft issue</Button>}</div></li>)}</ul></div>)}
          {data.activity.length > 6 && <Button variant="text" onClick={() => setAllActivity((value) => !value)}>{allActivity ? "Show less activity" : `Show all ${data.activity.length} activity items`}</Button>}
        </Card>
      </div>
      <Card as="section" labelledBy="career-repositories" className={s.repos}>
        <div className={`${s.between} ${s.repoToolbar}`}><div className={s.row}><h2 id="career-repositories" className={s.h2}>Repositories</h2><Segmented label="Repository filter" small value={filter} onChange={setFilter} options={[{ value: "all", label: "All", count: visible.length }, { value: "failing", label: "Failing CI", count: visible.filter((r) => r.ci === "failing").length }, { value: "prs", label: "Open PRs", count: visible.filter((r) => r.openPrs > 0).length }]} /></div><SearchField label="Find a repository" placeholder="Find a repository" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className={`${s.repoCols} ${s.repoHead}`} aria-hidden="true"><span>REPOSITORY</span><span>CI</span><span>COMMITS · 14 DAYS</span><span className={s.right}>PRS</span><span className={s.right}>STARS</span><span className={s.right}>UPDATED</span></div>
        <ul className={s.list} aria-label="Repositories" onKeyDown={(e) => {
          if (!["ArrowDown", "ArrowUp", "j", "k", "Home", "End"].includes(e.key)) return;
          const links = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>("[data-repo]")];
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          if (index < 0) return;
          e.preventDefault();
          const next = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : (index + (["ArrowDown", "j"].includes(e.key) ? 1 : links.length - 1)) % links.length;
          setFocused(repos[next]!.id); links[next]?.focus();
        }}>{repos.map((r, i) => <li key={r.id}><Link href={repoPath(r.fullName)} aria-label={r.fullName} data-repo tabIndex={r.id === focused || (!repos.some((r) => r.id === focused) && i === 0) ? 0 : -1} onFocus={() => setFocused(r.id)} className={`${s.repoCols} ${s.repoRow}`}><span className={s.repoInfo}><span className={s.row}><span className={s.repoName}>{r.fullName}</span><span className={s.visibility}><Icon name={r.archived ? "archive" : r.private ? "lock" : "public"} size={12} />{r.archived ? "Archived" : r.private ? "Private" : "Public"}</span></span><span className={`${s.small} ${s.truncate}`}>{r.description ?? "No description"}</span><span className={s.small}>{r.primaryLanguage ?? "Language unknown"} · {r.synced ? `${r.openIssues} your open issues` : "Not synced"}</span></span><CiStatus ci={r.ci} /><span className={s.desktop}><Bars values={weeklyCommits(extra.contributions, now, r.id)} label={`Weekly synced commits over the last 12 weeks for ${r.fullName}`} /></span><span className={`${s.meta} ${s.right} ${s.desktop}`}>{r.synced ? r.openPrs : "—"}</span><span className={`${s.meta} ${s.right} ${s.desktop}`}>★ {extra.stars[r.fullName] ?? "—"}</span><span className={`${s.meta} ${s.right} ${s.desktop}`}>{relativeTime(r.pushedAt, now)}</span></Link></li>)}</ul>
        {repos.length === 0 && <EmptyState icon="search" title="No repositories match." action={<Button onClick={() => { setQ(""); setFilter("all"); setArchived(true); }}>Clear filters</Button>} />}
      </Card>
    </>}
  </Page>;
}
