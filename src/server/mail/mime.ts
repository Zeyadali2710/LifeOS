// Pure reply-MIME builder. Gmail fills From.
type Addr = { name: string; address: string };

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export const replyMessageId = (approvalId: string) => `<approval-${approvalId}@lifeos.local>`;

function addrs(list: Addr[]): string {
  return list
    .map((a) => {
      const addr = clean(a.address);
      const name = clean(a.name);
      return name ? `"${name.replace(/[\\"]/g, "\\$&")}" <${addr}>` : addr;
    })
    .join(", ");
}

function subjectHeader(subject: string): string {
  let s = clean(subject);
  if (!/^re:/i.test(s)) s = `Re: ${s}`;
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

export function buildReplyMime(p: {
  to: Addr[];
  cc: Addr[];
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string | null;
  approvalId: string | null;
}): string {
  const h: string[] = [`To: ${addrs(p.to)}`];
  if (p.cc.length) h.push(`Cc: ${addrs(p.cc)}`);
  h.push(`Subject: ${subjectHeader(p.subject)}`);
  const irt = p.inReplyTo ? clean(p.inReplyTo) : "";
  if (irt) {
    h.push(`In-Reply-To: ${irt}`);
    const refs = [...new Set([...(p.references ? clean(p.references).split(/\s+/) : []), irt].filter(Boolean))];
    h.push(`References: ${refs.join(" ")}`);
  }
  if (p.approvalId) h.push(`Message-ID: ${replyMessageId(clean(p.approvalId))}`);
  h.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64");
  const body = (b64(p.body).match(/.{1,76}/g) ?? []).join("\r\n");
  return Buffer.from(`${h.join("\r\n")}\r\n\r\n${body}\r\n`, "utf8").toString("base64url");
}
