import Link from "next/link";
import type { ReactNode } from "react";
import type { RepoDetailDTO } from "@/lib/project-types";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { CiChipView } from "@/projects/status";
import { Badge } from "@/legacy-ui/badge";
import { Icon } from "@/legacy-ui/icon";
import { SectionHeader } from "@/legacy-ui/section-header";
import { LanguageBar } from "./language-bar";
import { relativeTime } from "./repo-card";

const REVIEW = {
  approved: { label: "Approved", tone: "green" },
  changes_requested: { label: "Changes requested", tone: "red" },
  review_required: { label: "Review required", tone: "amber" },
  draft: { label: "Draft", tone: "neutral" },
} as const;

const ROW = "flex items-center justify-between gap-3 rounded-16 px-3 py-2.5 text-text hover:bg-white/5";

function Row({ url, children }: { url: string | null; children: ReactNode }) {
  return (
    <li>
      {isSafeGithubUrl(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={ROW}>
          {children}
        </a>
      ) : (
        <div className={ROW}>{children}</div>
      )}
    </li>
  );
}

function Section({ id, label, meta, empty, count, children }: { id: string; label: string; meta?: string; empty: string; count: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} label={label} meta={meta} />
      <ul className="glass-card rounded-24 p-2">
        {count === 0 ? <li className="px-3 py-6 text-center text-[13.5px] text-text-2">{empty}</li> : children}
      </ul>
    </section>
  );
}

const Main = ({ title, sub }: { title: string; sub: string }) => (
  <span className="min-w-0">
    <span className="block truncate text-[13.5px]">{title}</span>
    <span className="block truncate text-[12.5px] text-text-3">{sub}</span>
  </span>
);

const When = ({ at, now }: { at: string | null; now: string }) => <span className="text-[10.5px] text-text-3">{at ? relativeTime(at, now) : ""}</span>;

export function RepoDetail({ d, now }: { d: RepoDetailDTO; now: string }) {
  const r = d.repo;
  return (
    <>
      <div>
        <Link href="/career" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text">
          <Icon name="arrow_back" size={15} />
          Career
        </Link>
        <p className="mb-2.5 text-[11px] font-medium tracking-[.14em] text-amber uppercase">REPOSITORY</p>
        <h1 className="font-display text-[clamp(34px,4.4vw,60px)] leading-[.95] font-normal tracking-[-0.015em]">{r.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-text-2">
          {r.primaryLanguage && <span>{r.primaryLanguage}</span>}
          {r.defaultBranch && <span className="font-code">{r.defaultBranch}</span>}
          <CiChipView ci={r.ci} />
          {isSafeGithubUrl(r.htmlUrl) && (
            <a href={r.htmlUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.name} on GitHub`} className="inline-flex items-center gap-1.5 text-cyan">
              <Icon name="open_in_new" size={14} />
              GitHub
            </a>
          )}
        </div>
        {r.description && <p className="mt-3 max-w-[640px] text-[15px] text-text-2">{r.description}</p>}
      </div>

      {r.languages.length > 0 && (
        <div className="glass-card rounded-24 p-5">
          <LanguageBar slices={r.languages} />
        </div>
      )}

      <div className="grid gap-6 desk:grid-cols-2">
        <Section id="repo-prs" label="OPEN PULL REQUESTS" empty="No open pull requests." count={d.pulls.length}>
          {d.pulls.map((p) => (
            <Row key={p.number} url={p.url}>
              <Main title={p.title} sub={`#${p.number}${p.author ? ` · ${p.author}` : ""}`} />
              <Badge kind="status" tone={REVIEW[p.review].tone}>
                {REVIEW[p.review].label}
              </Badge>
            </Row>
          ))}
        </Section>
        <Section id="repo-issues" label="OPEN ISSUES" meta="yours only" empty="No open issues." count={d.issues.length}>
          {d.issues.map((i) => (
            <Row key={i.number} url={i.url}>
              <Main title={i.title} sub={`#${i.number}${i.author ? ` · ${i.author}` : ""}`} />
            </Row>
          ))}
        </Section>
        <Section id="repo-runs" label="RECENT CI RUNS" empty="No CI runs found for this repository." count={d.runs.length}>
          {d.runs.map((c) => (
            <Row key={c.id} url={c.url}>
              <Main title={c.name ?? "Workflow run"} sub={c.branch ?? ""} />
              <span className="flex items-center gap-3">
                <CiChipView ci={c.ci} />
                <When at={c.at} now={now} />
              </span>
            </Row>
          ))}
        </Section>
        <Section id="repo-commits" label="RECENT COMMITS" empty="No commits synced yet." count={d.commits.length}>
          {d.commits.map((c) => (
            <Row key={c.sha} url={c.url}>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px]">{c.message.split("\n")[0]}</span>
                <span className="block truncate text-[12.5px] text-text-3">
                  <span className="font-code">{c.sha.slice(0, 7)}</span>
                  {c.author ? ` · ${c.author}` : ""}
                </span>
              </span>
              <When at={c.at} now={now} />
            </Row>
          ))}
        </Section>
      </div>

      {d.projects.length > 0 && (
        <section aria-labelledby="repo-projects">
          <SectionHeader id="repo-projects" label="LINKED PROJECTS" />
          <div className="flex flex-wrap gap-2">
            {d.projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="rounded-full border border-white/10 bg-white/[.03] px-3.5 py-1.5 text-[12.5px] text-text hover:bg-white/[.06]">
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
