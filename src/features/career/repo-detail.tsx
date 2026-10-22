"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { RepoDetailDTO } from "@/lib/project-types";
import { isSafeGithubUrl } from "@/lib/safe-url";
import type { RepoViewData } from "@/server/career-view";
import { addLinkAction } from "@/server/project-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button, ButtonLink, IconButton } from "@/ui/button";
import { Select, SelectField, Tabs } from "@/ui/controls";
import { Avatar, LabelPill, Status, Tag } from "@/ui/display";
import { Alert, EmptyState } from "@/ui/feedback";
import { Icon } from "@/ui/icon";
import { Card, Page, StatTile } from "@/ui/layout";
import { Dialog } from "@/ui/overlay";
import { CiStatus, GithubLink, Languages, Readme } from "./components";
import { CI, relativeTime } from "./model";
import s from "./career.module.css";

const review = {
  approved: { glyph: "✓", tone: "working", label: "Approved" },
  changes_requested: { glyph: "!", tone: "failed", label: "Changes requested" },
  review_required: { glyph: "○", tone: "approval", label: "Review required" },
  draft: { glyph: "–", tone: "idle", label: "Draft" },
} as const;

function LinkProject({ d, options, onClose }: { d: RepoDetailDTO; options: RepoViewData["projectOptions"]; onClose: () => void }) {
  const [project, setProject] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useShell();
  const available = options.filter((p) => !d.projects.some((linked) => linked.id === p.id));
  async function submit() {
    if (!project) { setError("Choose a project."); return; }
    setBusy(true); setError("");
    try {
      const result = await addLinkAction(project, { kind: "repo", repoId: d.repo.id });
      if (!result.ok) { setError("errors" in result ? Object.values(result.errors).join(" ") : "Couldn't link this repository. Try again."); return; }
      toast("Repository linked to project."); router.refresh(); onClose();
    } catch { setError("Couldn't link this repository. Try again."); }
    finally { setBusy(false); }
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title="Link to project" footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !available.length} onClick={() => void submit()}>{busy ? "Linking…" : "Link repository"}</Button></>}>
    <div className={s.form}>{error && <Alert>{error}</Alert>}{available.length ? <SelectField label="Project" value={project} onChange={(e) => setProject(e.target.value)}><option value="">Choose a project…</option>{available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField> : <EmptyState title="No projects available" body="Create a project to link this repository." action={<ButtonLink href="/projects">View projects</ButtonLink>} />}</div>
  </Dialog>;
}

export function RepoDetail({ d, extra, now, tab }: { d: RepoDetailDTO; extra: RepoViewData; now: string; tab: string }) {
  const { toast, openAI } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [linking, setLinking] = useState(false);
  const [allCommits, setAllCommits] = useState(false);
  const r = d.repo;
  const currentBranch = params.get("branch") ?? r.defaultBranch ?? "main";
  const ask = () => openAI(`Ask Projects to draft an issue for ${r.fullName}${r.ci === "failing" ? " investigating its failing CI" : ""}. Prepare a proposal for my approval; do not publish it.`);
  const tabHref = (value: string) => { const next = new URLSearchParams(params); next.set("tab", value); return `${pathname}?${next}`; };
  const latest = d.commits[0];
  async function copyClone() {
    try { await navigator.clipboard.writeText(`https://github.com/${r.fullName}.git`); toast("Copied clone URL."); }
    catch { toast("Couldn't copy clone URL. Try again.", "error"); }
  }
  const labels = (n: number) => extra.labels.find((i) => i.number === n);
  const max = Math.max(1, ...extra.weeks.map((w) => w.total));
  const weeklyTotal = extra.weeks.reduce((n, w) => n + w.total, 0);
  const firstHalf = extra.weeks.slice(0, 6).reduce((n, w) => n + w.total, 0);
  const secondHalf = extra.weeks.slice(6).reduce((n, w) => n + w.total, 0);
  const adds = extra.frequency.reduce((n, row) => n + row[1], 0);
  const dels = extra.frequency.reduce((n, row) => n + Math.abs(row[2]), 0);
  const allRuns = extra.runs;
  const failure = allRuns.find((run) => run.ci === "failing");
  return <Page label={`Career · ${r.name}`} className={s.page}><div className={s.stack}>
    <header className={s.repoHeader}>
      <div className={s.repoHeading}><nav className={s.breadcrumb} aria-label="Breadcrumb"><Link href="/career"><Icon name="chevron_left" size={18} />Career</Link><span>/</span><span className={s.meta}>{r.owner ?? r.fullName.split("/")[0]}</span><span>/</span></nav>
        <div className={s.row}><h1 className={s.title}>{r.name}</h1><span className={s.visibility}><Icon name={r.archived ? "archive" : r.private ? "lock" : "public"} size={13} />{r.archived ? "Archived" : r.private ? "Private" : "Public"}</span><CiStatus ci={r.ci} /></div>
        <p className={s.description}>{r.description ?? "No description"}</p>
        {extra.topics.length > 0 && <div className={s.row}>{extra.topics.map((topic) => <Tag key={topic} variant="topic">{topic}</Tag>)}</div>}
      </div>
      <div className={s.headerActions}>{d.projects.map((p) => <ButtonLink key={p.id} href={`/projects/${p.id}`} icon="link"><span className={s.truncate}>Linked to {p.name}</span></ButtonLink>)}<Button icon="link" onClick={() => setLinking(true)}>{d.projects.length ? "Link another project" : "Link to project"}</Button>{isSafeGithubUrl(r.htmlUrl) && <ButtonLink href={r.htmlUrl} external variant="primary" icon="open_in_new">Open on GitHub</ButtonLink>}</div>
    </header>
    <Tabs label="Repository" value={tab} items={[
      { value: "code", label: "Code", icon: "code", href: tabHref("code") },
      { value: "prs", label: "Pull requests", icon: "alt_route", count: d.pulls.length, href: tabHref("prs") },
      { value: "issues", label: "Issues", icon: "radio_button_checked", count: d.issues.length, href: tabHref("issues") },
      { value: "actions", label: "Actions", icon: "play_circle", href: tabHref("actions") },
      { value: "insights", label: "Insights", icon: "insights", href: tabHref("insights") },
    ]} />
    {tab === "code" && <div className={s.columns}>
      <div className={`${s.main} ${s.stack}`}>
        <div className={s.row}><Select label="Branch" value={currentBranch} onChange={(e) => { const next = new URLSearchParams(params); next.set("branch", e.target.value); router.push(`${pathname}?${next}`, { scroll: false }); }}><option value={currentBranch}>{currentBranch}</option>{extra.branches.filter((b) => b !== currentBranch).map((b) => <option key={b}>{b}</option>)}</Select><span className={s.small}>{extra.branches.length ? `${extra.branches.length}${extra.branchesLimited ? "+" : ""} branches` : "Branch count unavailable"}</span><span className={s.clone}><span className={s.truncate}>git clone https://github.com/{r.fullName}.git</span><IconButton small icon="content_copy" label="Copy clone URL" onClick={() => void copyClone()} /></span></div>
        <Card head={<div className={s.fileHead} title={`Latest synced commit on ${r.defaultBranch ?? "the default branch"}`}>{latest ? <><Avatar name={latest.author ?? r.owner ?? "GitHub"} size={24} /><strong>{latest.author ?? "Unknown author"}</strong><span className={`${s.small} ${s.truncate}`}>{latest.message}</span><GithubLink url={latest.url}><span className={s.meta}>{latest.sha.slice(0, 7)}</span></GithubLink><span className={s.meta}>{relativeTime(latest.at, now)}</span><span className={s.small}><Icon name="history" size={16} /> {d.commits.length} synced commits</span></> : "Files"}</div>}>
          {extra.files.length ? extra.files.map((f) => <GithubLink key={f.path} url={f.html_url} className={s.fileRow}><Icon name={f.type === "dir" ? "folder" : "draft"} size={18} fill={f.type === "dir"} style={{ color: f.type === "dir" ? "var(--status-approval)" : "var(--ink-2)" }} /><span className={s.truncate}>{f.name}</span><span className={`${s.small} ${s.truncate} ${s.fileMessage}`}>{f.message ?? "—"}</span><span className={`${s.meta} ${s.right}`}>{f.at ? relativeTime(f.at, now) : "—"}</span></GithubLink>) : <EmptyState icon="folder" title={extra.filesUnavailable ? "Files unavailable" : "No files on this branch"} body="GitHub may be unavailable or this token may not have Contents access. Synced activity is still available." />}
          {extra.filesLimited && <p className={s.panel}>Commit metadata is shown for the first 30 root entries. <GithubLink url={r.htmlUrl}>View all files on GitHub</GithubLink></p>}
        </Card>
        <Card as="article" head={<><Icon name="menu_book" size={18} />README.md</>}>{extra.readme ? <Readme text={extra.readme} /> : <EmptyState icon="menu_book" title="README unavailable" body="No README was returned for this branch. It may be missing or inaccessible to the read-only token." />}</Card>
      </div>
      <aside className={`${s.side} ${s.stack}`}>
        <Card as="section" className={s.panel}><h2 className={s.h2}>About</h2><div className={s.stats}><StatTile value={extra.weeks.length ? extra.weeks.slice(-4).reduce((n, w) => n + w.total, 0) : "—"} label="Commits · 4 weeks" /><StatTile value={r.openPrs} label="Open PRs" /><StatTile value={extra.branches.length ? `${extra.branches.length}${extra.branchesLimited ? "+" : ""}` : "—"} label="Branches" /><StatTile value={extra.stars ?? "—"} label="Stars" /></div><div className={s.meta}>LANGUAGES</div><Languages slices={r.languages} />{!r.synced && <p className={s.small}>Not synced · this repository is outside the active sync window.</p>}</Card>
        <Card as="section" className={s.panel}><div className={s.between}><h2 className={s.h2}>CI · last 12 runs</h2><ButtonLink href={tabHref("actions")} variant="text">All runs</ButtonLink></div><div className={s.strip} role="img" aria-label={`Recent CI, oldest to newest: ${[...allRuns].reverse().map((run) => `${CI[run.ci].label} ${run.at ?? ""}`).join(", ") || "No runs synced"}`}>{Array.from({ length: Math.max(0, 12 - allRuns.length) }, (_, i) => <span key={`empty-${i}`} style={{ background: "var(--wash)" }} title="No run synced" />)}{[...allRuns].reverse().map((run) => <GithubLink key={run.id} url={run.url} title={`${CI[run.ci].label} · ${run.at ?? "unknown time"}`}><span style={{ display: "block", height: "100%", borderRadius: "var(--radius-xs)", background: `var(--${run.ci === "passing" ? "status-working" : run.ci === "failing" ? "status-failed" : run.ci === "running" ? "status-approval" : "wash"})` }} /></GithubLink>)}</div>{r.ci === "failing" && <Alert action={<Button variant="text" onClick={ask}>Ask Projects to draft an issue</Button>}>{failure ? `${failure.name} failed ${relativeTime(failure.at, now)} on ${failure.branch ?? "an unknown branch"}.` : "CI is failing on this repository."}</Alert>}</Card>
        <Card as="section" className={s.panel}><h2 className={s.h2}>Recent commits</h2>{d.commits.length ? d.commits.slice(0, allCommits ? d.commits.length : 4).map((c) => <GithubLink key={c.sha} url={c.url} className={s.commit}><span className={s.truncate}>{c.message.split("\n")[0]}</span><span className={s.meta}>{c.sha.slice(0, 7)} · {c.author ?? "Unknown author"} · {relativeTime(c.at, now)}</span></GithubLink>) : <p className={s.small}>No commits synced yet.</p>}{d.commits.length > 4 && <Button variant="text" onClick={() => setAllCommits((value) => !value)}>{allCommits ? "Show fewer commits" : `Show all ${d.commits.length} synced commits`}</Button>}</Card>
      </aside>
    </div>}
    {tab === "prs" && <Card head={<div className={s.row}><Status glyph="○" tone="working">{d.pulls.length} open</Status><Status glyph="↗" tone="merged">{extra.merged.length} recent merged</Status></div>}>
      {d.pulls.map((p) => {
        const state = review[p.review];
        const live = extra.pulls.find((pull) => pull.number === p.number);
        const failing = live?.checks?.some((c) => c.conclusion && ["failure", "timed_out", "action_required"].includes(c.conclusion));
        const pending = live?.checks?.some((c) => c.status !== "completed");
        const passed = !!live?.checks?.length && live.checks.every((c) => c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral");
        return <div key={p.number} className={s.item}><Icon name="alt_route" size={18} /><div className={s.itemBody}><GithubLink url={p.url} className={s.itemTitle}>#{p.number} {p.title}</GithubLink>{live && <Tag variant="source">{live.branch}</Tag>}<p className={s.small}>{p.author ?? "Unknown author"}</p><Status glyph={state.glyph} tone={state.tone}>{state.label}</Status></div><Status glyph={failing ? "×" : passed ? "✓" : "–"} tone={failing ? "failed" : passed ? "working" : "idle"}>{p.review === "draft" ? "Draft" : failing ? "Checks failing" : pending ? "Checks pending" : passed ? "Checks passed" : "Checks unavailable"}</Status></div>;
      })}
      {extra.merged.map((p) => <div key={`merged-${p.number}`} className={s.item}><Icon name="merge" size={18} /><div><GithubLink url={p.url} className={s.itemTitle}>#{p.number} {p.title}</GithubLink><p className={s.small}>{p.author} · merged {relativeTime(p.at, now)}</p></div><Status tone="merged" glyph="↗">Merged</Status></div>)}
      {!d.pulls.length && !extra.merged.length && <EmptyState title="No pull requests." icon="alt_route" />}
    </Card>}
    {tab === "issues" && <Card head={<div className={s.between}><Status tone="working" glyph="○">{d.issues.length} open · yours only</Status><Button variant="text" onClick={ask}>Ask Projects to draft an issue</Button></div>}>
      {d.issues.map((issue) => <div key={issue.number} className={s.item}><Icon name="radio_button_checked" size={18} /><div className={s.itemBody}><div className={s.row}><GithubLink url={issue.url} className={s.itemTitle}>{issue.title}</GithubLink>{labels(issue.number)?.labels.map((label) => <LabelPill key={label} tone={label.toLowerCase() === "bug" ? "failed" : label.toLowerCase() === "enhancement" ? "working" : "merged"}>{label}</LabelPill>)}</div><p className={s.small}>#{issue.number} · {issue.author ?? "Unknown author"} · updated {relativeTime(labels(issue.number)?.at ?? null, now)}</p></div></div>)}
      {!d.issues.length && <EmptyState icon="bug_report" title="No open issues." />}
    </Card>}
    {tab === "actions" && <Card><div className={s.scroll}><table className={s.runTable}><caption className={s.groupLabel}>Recent workflow runs</caption><thead><tr><th scope="col">STATUS</th><th scope="col">RUN</th><th scope="col">BRANCH</th><th scope="col">DURATION</th><th scope="col">WHEN</th></tr></thead><tbody>{allRuns.map((run) => <tr key={run.id}><td><CiStatus ci={run.ci} /></td><td><GithubLink url={run.url}>{run.name}</GithubLink><p className={s.small}>{run.number ? `CI #${run.number}` : `Run ${run.id}`}</p></td><td className={s.meta}>{run.branch ?? "—"}</td><td className={s.meta}>{run.seconds === null ? "—" : `${Math.floor(run.seconds / 60)}m ${run.seconds % 60}s`}</td><td className={s.meta}>{relativeTime(run.at, now)}</td></tr>)}</tbody></table></div>{!allRuns.length && <EmptyState icon="play_circle" title="No CI runs found for this repository." />}</Card>}
    {tab === "insights" && <div className={s.columns}><Card as="section" className={`${s.main} ${s.panel}`}><h2 className={s.h2}>Commit activity</h2><p className={s.small}>Commits per week · last 12 weeks</p>{extra.weeks.length ? <><div className={s.plot} role="img" aria-label={`${weeklyTotal} commits over ${extra.weeks.length} weeks; ${secondHalf > firstHalf ? "increasing" : secondHalf < firstHalf ? "decreasing" : "steady"} between the first and second halves. Weekly counts: ${extra.weeks.map((w) => w.total).join(", ")}.`}>{extra.weeks.map((w) => <div key={w.week} className={s.bar} title={`${new Date(w.week * 1000).toISOString().slice(0, 10)}: ${w.total} commits`}><span>{w.total}</span><span className={s.barFill} style={{ height: `${w.total / max * 85}%` }} /></div>)}</div><div className={s.plotLabels}>{extra.weeks.map((w, i) => <span key={w.week}>W{i + 1}</span>)}</div></> : <EmptyState icon="bar_chart" title="Commit activity unavailable" body="GitHub may still be computing these statistics. Try again later." />}</Card><Card as="section" className={`${s.side} ${s.panel}`}><h2 className={s.h2}>Code frequency · recent weeks</h2><p className={s.small}>Weekly buckets starting within the last 30 days</p>{extra.frequency.length ? <div className={s.frequency}><div><div className={`${s.big} ${s.positive}`}>+{adds.toLocaleString()}</div><p className={s.small}>additions</p></div><div><div className={`${s.big} ${s.negative}`}>−{dels.toLocaleString()}</div><p className={s.small}>deletions</p></div></div> : <p className={s.small}>Code frequency unavailable.</p>}<h2 className={s.h2}>Contributors</h2>{extra.contributors.map((c) => <div key={c.login} className={s.between}><span className={s.row}><Avatar name={c.login} /><GithubLink url={c.html_url}>{c.login}</GithubLink></span><span className={s.meta}>{c.contributions} commits</span></div>)}{!extra.contributors.length && <p className={s.small}>Contributors unavailable.</p>}</Card></div>}
  </div>{linking && <LinkProject d={d} options={extra.projectOptions} onClose={() => setLinking(false)} />}</Page>;
}
