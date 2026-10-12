import { Icon } from "@/ui/icon";
import { isSafeGithubUrl } from "@/lib/safe-url";

export type Inline = { t: "text"; text: string } | { t: "code"; text: string } | { t: "citation"; ref: string; url: string };
export type Block = { t: "p"; inline: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "code"; text: string };

const REPO = "[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*";
const CITE = new RegExp(`(?<![\\w/.#-])(${REPO})(?:#(\\d+))?(?![\\w/-])`, "g");

function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const text = (t: string) => {
    if (t) out.push({ t: "text", text: t });
  };
  s.split(/(`[^`\n]+`)/).forEach((seg, i) => {
    if (i % 2 === 1) {
      out.push({ t: "code", text: seg.slice(1, -1) });
      return;
    }
    let last = 0;
    for (const m of seg.matchAll(CITE)) {
      text(seg.slice(last, m.index));
      out.push({ t: "citation", ref: m[0], url: `https://github.com/${m[1]}${m[2] ? `/issues/${m[2]}` : ""}` });
      last = m.index + m[0].length;
    }
    text(seg.slice(last));
  });
  return out;
}

/** Safe markdown subset: paragraphs, "- " lists, fenced and inline code, GitHub citations. Nothing else is interpreted. */
export function parseAnswer(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ t: "p", inline: inline(para.join("\n")) });
    if (list) blocks.push({ t: "ul", items: list });
    para = [];
    list = null;
  };
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !(lines[i] ?? "").startsWith("```"); i++) code.push(lines[i] ?? "");
      blocks.push({ t: "code", text: code.join("\n") });
    } else if (/^\s*[-*] /.test(line)) {
      if (para.length) flush();
      (list ??= []).push(inline(line.replace(/^\s*[-*] /, "")));
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === "text") return n.text;
        if (n.t === "code") return <code key={i} className="rounded-5 bg-white/[.06] px-1 font-code text-[11.5px]">{n.text}</code>;
        if (!isSafeGithubUrl(n.url)) return n.ref;
        return (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${n.ref}, opens GitHub`}
            className="mx-0.5 inline-flex items-center gap-1 rounded-6 bg-[rgba(100,210,255,.1)] px-1.5 py-px align-baseline font-code text-[11.5px] text-cyan hover:bg-[rgba(100,210,255,.18)] hover:text-cyan-soft"
          >
            {n.ref}
            <Icon name="open_in_new" size={12} />
          </a>
        );
      })}
    </>
  );
}

export function AnswerText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = parseAnswer(text);
  return (
    <div className="flex flex-col gap-2 text-[14px] leading-[1.5] break-words">
      {blocks.map((b, i) =>
        b.t === "p" ? (
          <p key={i} className="whitespace-pre-wrap"><Inlines nodes={b.inline} /></p>
        ) : b.t === "ul" ? (
          <ul key={i} className="m-0 list-disc pl-5">
            {b.items.map((it, j) => <li key={j}><Inlines nodes={it} /></li>)}
          </ul>
        ) : (
          <pre key={i} className="max-h-60 overflow-auto rounded-14 border border-white/[.08] bg-white/[.03] px-3 py-2.5 font-code text-[11.5px] whitespace-pre-wrap text-text-2">{b.text}</pre>
        ),
      )}
      {streaming && <span aria-hidden="true" className="inline-block h-[1em] w-[2px] animate-[lo-caret_1s_steps(1)_infinite] bg-cyan motion-reduce:animate-none" />}
    </div>
  );
}
