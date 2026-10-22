"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EventSourceDTO } from "@/lib/outreach-types";
import { addFeedAction, removeFeedAction, saveEventbriteOrganizersAction, setFeedEnabledAction } from "@/server/outreach-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/overlay";
import { Checkbox, TextField } from "@/ui/controls";
import { Section } from "@/ui/layout";
import { EmptyState } from "@/ui/feedback";
import { IconButton } from "@/ui/button";
import s from "./settings.module.css";
import { ConnectionRow, type RowStatus } from "./connection-row";
export type EventKeys = Record<"eventbrite" | "luma", {
  last4: string;
  status: string;
} | null>;
const FAIL = "Couldn't save that. Try again.";
const ADD_ERRORS: Record<string, string> = {
  invalid: "Enter a full https:// address.",
  blocked: "That address isn't allowed. Use a public https link.",
  unreadable: "That feed couldn't be read. Check the link and try again.",
};
function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1)
    return "just now";
  if (m < 60)
    return `${m} min ago`;
  if (m < 1440)
    return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
const keyStatus = (k: {
  status: string;
} | null): RowStatus => (!k ? "none" : k.status === "error" ? "error" : "connected");
const mock = "No public API for discovery. Import their event pages by URL instead.";
export function OutreachConnections({ sources, keys }: {
  sources: EventSourceDTO[];
  keys: EventKeys;
}) {
  const router = useRouter();
  const { toast } = useShell();
  const eb = sources.find((s) => s.kind === "eventbrite");
  const feeds = sources.filter((s) => s.kind === "ics");
  const refresh = () => router.refresh();
  const keyDetail = (k: {
    last4: string;
  } | null, help: string) => (k ? <span className={s.mono}>Connected · ••••{k.last4}
  </span> : help);
  return (<>
    <ConnectionRow id="eventbrite" title="Eventbrite key" name="Eventbrite" status={keyStatus(keys.eventbrite)} statusLabel={keys.eventbrite ? undefined : "MOCK"} detail={keyDetail(keys.eventbrite, "Mock events until you add a private token.")} removeBody="Events from this source go back to mock data." onChanged={refresh}>
      <OrganizerIds key={(eb?.organizerIds ?? []).join(",")} initial={eb?.organizerIds ?? []} discover={eb?.discover ?? null} />
    </ConnectionRow>
    <ConnectionRow id="luma" title="Luma key" name="Luma" status={keyStatus(keys.luma)} statusLabel={keys.luma ? undefined : "MOCK"} detail={keyDetail(keys.luma, "Covers only the Luma Plus calendar the key was made on. For Sydney discovery, add Luma's iCal feed below.")} removeBody="Events from this source go back to mock data." onChanged={refresh} />
    <ConnectionRow name="Meetup" readOnly status="none" statusLabel="MOCK" detail={mock} />
    <ConnectionRow name="Humanitix" readOnly status="none" statusLabel="MOCK" detail={mock} />
    <Feeds feeds={feeds} toast={toast} refresh={refresh} />
  </>);
}
function OrganizerIds({ initial, discover }: {
  initial: string[];
  discover: boolean | null;
}) {
  const { toast } = useShell();
  const router = useRouter();
  const [value, setValue] = useState(initial.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function save() {
    const ids = value.split(",").map((x) => x.trim()).filter(Boolean);
    if (ids.length > 20 || ids.some((i) => !/^\d{1,20}$/.test(i)))
      return setError("Use numeric organizer IDs separated by commas, up to 20.");
    setError(undefined);
    setBusy(true);
    const r = await saveEventbriteOrganizersAction(ids).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      toast("Organizer IDs saved");
      router.refresh();
    }
    else
      toast(FAIL, "error");
  }
  return <div className={s.form}>
    <TextField label="Organizer IDs" error={error} help={discover === false ? "With this token LifeOS can only list your own events." : "Events from these organizers appear in Outreach."} spellCheck={false} autoComplete="off" value={value} onChange={e => setValue(e.target.value)} />
    {error && <p role="alert" className={s.error}>
      {error}
    </p>}<div>
      <Button disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save IDs"}
      </Button>
    </div>
  </div>;
}
function Feeds({ feeds, toast, refresh }: {
  feeds: EventSourceDTO[];
  toast: (m: string, k?: "success" | "error") => void;
  refresh: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<EventSourceDTO | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !url.trim())
      return setError("Enter a label and a full https:// address.");
    setError(undefined);
    setBusy(true);
    const r = await addFeedAction(label, url).catch(() => ({ ok: false as const, error: "failed" }));
    setBusy(false);
    if (r.ok) {
      setLabel("");
      setUrl("");
      toast("Feed added");
      refresh();
    }
    else if ("error" in r && ADD_ERRORS[r.error])
      setError(ADD_ERRORS[r.error]);
    else
      toast(FAIL, "error");
  }
  async function toggle(f: EventSourceDTO, next: boolean) {
    setEnabled((m) => ({ ...m, [f.id]: next }));
    const r = await setFeedEnabledAction(f.id, next).catch(() => ({ ok: false }));
    if (!r.ok) {
      setEnabled((m) => ({ ...m, [f.id]: !next }));
      return toast(FAIL, "error");
    }
    refresh();
  }
  async function remove() {
    const f = confirm;
    setConfirm(null);
    if (!f)
      return;
    const r = await removeFeedAction(f.id).catch(() => ({ ok: false }));
    if (r.ok) {
      toast("Feed removed");
      refresh();
    }
    else
      toast(FAIL, "error");
  }
  return <div id="event-feeds" className={s.anchor}>
    <Section id="event-feeds-h" label="Event feeds" meta={`${feeds.length} ${feeds.length === 1 ? "feed" : "feeds"}`}>
      {feeds.length === 0 ? <EmptyState title="No feeds yet" body="Luma's Sydney feed is the best place to start." /> : <ul className={s.list}>
        {feeds.map(f => <li key={f.id} className={s.feedRow}>
          <Checkbox label={`Sync ${f.label}`} checked={enabled[f.id] ?? f.enabled} onChange={e => toggle(f, e.target.checked)} />
          <span className={s.note}>
            {f.host} · {f.lastSyncAt ? `Synced ${ago(f.lastSyncAt)}` : "Not synced yet"}
          </span>
          <IconButton icon="close" label={`Remove feed ${f.label}`} onClick={() => setConfirm(f)} />
          {f.lastSyncError && <p role="alert" className={s.error}>
            {f.lastSyncError}
          </p>}
        </li>)}
      </ul>}
      <form onSubmit={add} className={s.form}>
        <TextField label="Label" maxLength={60} value={label} onChange={e => setLabel(e.target.value)} />
        <TextField label="iCal URL" error={error} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} />
        {error && <p role="alert" className={s.error}>
          {error}
        </p>}<div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Adding…" : "Add feed"}
          </Button>
        </div>
      </form>
      <details className={s.disclosure}>
        <summary>How to add Luma&apos;s Sydney feed</summary>
        <p className={s.note}>Open luma.com/sydney, choose &quot;Add iCal Subscription&quot;, copy the link, and paste it here.</p>
      </details>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title="Remove feed" footer={<>
        <Button autoFocus id="remove-feed-cancel" onClick={() => setConfirm(null)}>Cancel</Button>
        <Button variant="danger" onClick={remove}>Remove feed</Button>
      </>}>
        <p className={s.note}>Remove &quot;{confirm?.label}&quot;? Events you haven&apos;t saved from it disappear at the next sync. Saved events stay.</p>
      </Dialog>
    </Section>
  </div>;
}
