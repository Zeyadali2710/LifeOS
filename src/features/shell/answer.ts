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
