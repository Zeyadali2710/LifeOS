// Typed Gmail client on the createGoogle base: same token source and error mapping, fixed host, no raw fetch here.
import { z } from "zod";
import { GMAIL_BASE, createGoogle } from "../calendar/google/client";
import { hasGmail } from "../calendar/connections";

export const gmailAllowed = (scopes: string[], which: "read" | "compose") => hasGmail(scopes, which);

type GmailPart = {
  mimeType?: string | null;
  filename?: string | null;
  headers?: { name: string; value: string }[] | null;
  body?: { data?: string | null; size?: number | null; attachmentId?: string | null } | null;
  parts?: GmailPart[] | null;
};
const part: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().nullish(),
    filename: z.string().nullish(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).nullish(),
    body: z.object({ data: z.string().nullish(), size: z.number().nullish(), attachmentId: z.string().nullish() }).nullish(),
    parts: z.array(part).nullish(),
  }),
);
const ids = z.object({ messages: z.array(z.object({ id: z.string(), threadId: z.string() })).nullish(), nextPageToken: z.string().nullish() });
const message = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).nullish(),
  snippet: z.string().nullish(),
  internalDate: z.string().nullish(),
  historyId: z.string().nullish(),
  payload: part.nullish(),
});
const ref = z.object({ id: z.string(), threadId: z.string(), labelIds: z.array(z.string()).nullish() });
const histItem = z.object({
  id: z.string(),
  messagesAdded: z.array(z.object({ message: ref })).nullish(),
  labelsAdded: z.array(z.object({ message: ref, labelIds: z.array(z.string()).nullish() })).nullish(),
  labelsRemoved: z.array(z.object({ message: ref, labelIds: z.array(z.string()).nullish() })).nullish(),
});
const histPage = z.object({ history: z.array(histItem).nullish(), nextPageToken: z.string().nullish(), historyId: z.string().nullish() });
const draft = z.object({ id: z.string(), message: z.object({ id: z.string(), threadId: z.string() }).nullish() });
const sent = z.object({ id: z.string(), threadId: z.string() });

const qs = (o: Record<string, string | number | undefined>, multi: Record<string, string[]> = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) p.set(k, String(v));
  for (const [k, vs] of Object.entries(multi)) for (const v of vs) p.append(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export type GmailHistoryItem = z.infer<typeof histItem>;
export type GmailMessage = z.infer<typeof message>;

export function createGmail({ getToken, fetch }: { getToken: () => Promise<string>; fetch?: typeof globalThis.fetch }) {
  const g = createGoogle({ base: GMAIL_BASE, getToken, fetch });
  const get = async <T>(path: string, s: z.ZodType<T>) => (await g.call("GET", path, s))!;
  const id = (x: string) => encodeURIComponent(x);

  return {
    profile: () => get("/profile", z.object({ emailAddress: z.string(), historyId: z.string() })),

    /** Pages via nextPageToken up to maxPages; truncated = more pages remained. */
    async listMessages({ q, labelIds, maxResults = 100, maxPages = 5 }: { q?: string; labelIds?: string[]; maxResults?: number; maxPages?: number }) {
      const out: { id: string; threadId: string }[] = [];
      let token: string | undefined;
      for (let i = 0; i < maxPages; i++) {
        const r = await get(`/messages${qs({ q, maxResults, pageToken: token }, { labelIds: labelIds ?? [] })}`, ids);
        out.push(...(r.messages ?? []));
        token = r.nextPageToken ?? undefined;
        if (!token) break;
      }
      return { ids: out, truncated: token !== undefined };
    },

    getMetadata: (mid: string, headers: string[]) => get(`/messages/${id(mid)}${qs({ format: "metadata" }, { metadataHeaders: headers })}`, message),
    getFull: (mid: string) => get(`/messages/${id(mid)}?format=full`, message),

    /** Throws kind "not_found" when startHistoryId is too old: the caller runs a full sync. */
    async history(startHistoryId: string) {
      const history: GmailHistoryItem[] = [];
      let token: string | undefined;
      let latest = startHistoryId;
      do {
        const r = await get(`/history${qs({ startHistoryId, labelId: "INBOX", maxResults: 500, pageToken: token }, { historyTypes: ["messageAdded", "labelAdded", "labelRemoved"] })}`, histPage);
        history.push(...(r.history ?? []));
        latest = r.historyId ?? latest;
        token = r.nextPageToken ?? undefined;
      } while (token);
      return { history, historyId: latest };
    },

    createDraft: async (raw: string, threadId: string) => (await g.call("POST", "/drafts", draft, { body: { message: { raw, threadId } } }))!,
    getDraft: (did: string) => get(`/drafts/${id(did)}`, draft),
    sendDraft: async (did: string) => (await g.call("POST", "/drafts/send", sent, { body: { id: did } }))!,
    deleteDraft: async (did: string) => void (await g.call("DELETE", `/drafts/${id(did)}`, z.unknown())),

    /** Thread message ids, labels and internalDate only (no headers, no bodies). */
    getThread: (tid: string) => get(`/threads/${id(tid)}?format=minimal`, z.object({ messages: z.array(message).nullish() })),

    async findSent(rfc822MessageId: string): Promise<string | null> {
      const r = await get(`/messages${qs({ q: `rfc822msgid:${rfc822MessageId} in:sent`, maxResults: 1 })}`, ids);
      return r.messages?.[0]?.id ?? null;
    },
  };
}
