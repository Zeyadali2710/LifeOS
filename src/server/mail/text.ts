import { capUtf8, htmlToText } from "../text";

export const MAIL_BODY_CAP = 16_384;

// Structural twin of Addr in src/lib/outreach-types.ts.
type Addr = { name: string; address: string };

export type GmailPayload = {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPayload[];
};

function find(p: GmailPayload, type: string): string | null {
  if (p.mimeType === type && p.body?.data && !p.body.attachmentId) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) {
    const r = find(c, type);
    if (r !== null) return r;
  }
  return null;
}

export function bodyText(payload: GmailPayload): { text: string; htmlOnly: boolean; truncated: boolean } {
  const plain = find(payload, "text/plain");
  const html = plain === null ? find(payload, "text/html") : null;
  const raw = plain ?? (html !== null ? htmlToText(html) : "");
  return { ...capUtf8(raw, MAIL_BODY_CAP), htmlOnly: plain === null && html !== null };
}

export function headerOf(headers: { name: string; value: string }[] | undefined, name: string): string | null {
  const n = name.toLowerCase();
  return headers?.find((h) => h.name.toLowerCase() === n)?.value ?? null;
}

export function parseAddrList(value: string | null | undefined): Addr[] {
  if (!value) return [];
  const parts: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of value) {
    if (ch === '"') q = !q;
    if (ch === "," && !q) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: Addr[] = [];
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    const m = /^(.*?)<([^<>]+)>\s*$/.exec(s);
    if (m) out.push({ name: m[1]!.trim().replace(/^"|"$/g, "").replace(/\\(.)/g, "$1"), address: m[2]!.trim() });
    else out.push({ name: "", address: s });
  }
  return out;
}
