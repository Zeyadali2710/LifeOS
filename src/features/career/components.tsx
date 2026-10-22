import type { ReactNode } from "react";
import type { CiChip, LanguageSlice } from "@/lib/project-types";
import { isSafeGithubUrl } from "@/lib/safe-url";
import { Status } from "@/ui/display";
import { CI } from "./model";
import s from "./career.module.css";

export function CiStatus({ ci }: { ci: CiChip }) {
  const state = CI[ci];
  return <Status tone={state.tone} glyph={state.glyph}>{state.label}</Status>;
}

export function GithubLink({ url, children, className, title }: { url: string | null; children: ReactNode; className?: string; title?: string }) {
  return isSafeGithubUrl(url) ? <a href={url} className={className} title={title} target="_blank" rel="noopener noreferrer">{children}</a> : <span className={className}>{children}</span>;
}

const palette = ["var(--status-working)", "var(--status-approval)", "var(--status-merged)", "var(--accent)", "var(--ink-2)"];
export function Languages({ slices }: { slices: LanguageSlice[] }) {
  if (!slices.length) return <p className={s.small}>Languages unavailable.</p>;
  return <div className={s.stack}>
    <div className={s.languageBar} role="img" aria-label={`Languages: ${slices.map((l) => `${l.name} ${l.pct}%`).join(", ")}`}>
      {slices.map((l, i) => <span key={l.name} style={{ width: `${l.pct}%`, background: palette[i % palette.length] }} />)}
    </div>
    <div className={s.legend}>{slices.map((l, i) => <span key={l.name}><span className={s.legendDot} style={{ background: palette[i % palette.length] }} /> {l.name} {l.pct}%</span>)}</div>
  </div>;
}

export function Bars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return <span className={s.spark} role="img" aria-label={label}>{values.map((value, i) => <span key={i} style={{ height: `${Math.max(3, value / max * 100)}%` }} />)}</span>;
}

/** Small safe subset: headings, paragraphs and fenced code; HTML and links stay literal text. */
export function Readme({ text }: { text: string }) {
  const chunks = text.split(/```[^\n]*\n([\s\S]*?)(?:```|$)/g);
  return <div className={s.readme}>{chunks.map((chunk, i) => i % 2 ? <pre key={i}><code>{chunk}</code></pre> : chunk.split(/\n\s*\n/).filter(Boolean).map((block, j) => {
    if (/^#{1,2} /.test(block)) return <h2 key={`${i}-${j}`}>{block.replace(/^#{1,2} /, "")}</h2>;
    if (/^#{3,6} /.test(block)) return <h3 key={`${i}-${j}`}>{block.replace(/^#{3,6} /, "")}</h3>;
    return <p key={`${i}-${j}`}>{block}</p>;
  }))}</div>;
}
