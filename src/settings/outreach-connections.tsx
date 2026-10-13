"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EventSourceDTO } from "@/lib/outreach-types";
import { addFeedAction, removeFeedAction, saveEventbriteOrganizersAction, setFeedEnabledAction } from "@/server/outreach-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Disclosure } from "@/ui/disclosure";
import { Checkbox, Field, Input } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { SectionHeader } from "@/ui/section-header";
import { ConnectionRow, type RowStatus } from "./connection-row";

export type EventKeys = Record<"eventbrite" | "luma", { last4: string; status: string } | null>;

const FAIL = "Couldn't save that. Try again.";
const ADD_ERRORS: Record<string, string> = {
  invalid: "Enter a full https:// address.",
  blocked: "That address isn't allowed. Use a public https link.",
  unreadable: "That feed couldn't be read. Check the link and try again.",
};

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

const keyStatus = (k: { status: string } | null): RowStatus => (!k ? "none" : k.status === "error" ? "error" : "connected");
const mock = "No public API for discovery. Import their event pages by URL instead.";

export function OutreachConnections({ sources, keys }: { sources: EventSourceDTO[]; keys: EventKeys }) {
  const router = useRouter();
  const { toast } = useShell();
  const eb = sources.find((s) => s.kind === "eventbrite");
  const feeds = sources.filter((s) => s.kind === "ics");
  const refresh = () => router.refresh();
  const keyDetail = (k: { last4: string } | null, help: string) => (k ? <span className="font-code">Connected · ••••{k.last4}</span> : help);

  return (
    <>
      <ConnectionRow
        id="eventbrite"
        title="Eventbrite key"
        tile="EB"
        name="Eventbrite"
        status={keyStatus(keys.eventbrite)}
        statusLabel={keys.eventbrite ? undefined : "MOCK"}
        detail={keyDetail(keys.eventbrite, "Mock events until you add a private token.")}
        removeBody="Events from this source go back to mock data."
        onChanged={refresh}
      >
        <OrganizerIds key={(eb?.organizerIds ?? []).join(",")} initial={eb?.organizerIds ?? []} discover={eb?.discover ?? null} />
      </ConnectionRow>
      <ConnectionRow
        id="luma"
        title="Luma key"
        tile="LU"
        name="Luma"
        status={keyStatus(keys.luma)}
        statusLabel={keys.luma ? undefined : "MOCK"}
        detail={keyDetail(keys.luma, "Covers only the Luma Plus calendar the key was made on. For Sydney discovery, add Luma's iCal feed below.")}
        removeBody="Events from this source go back to mock data."
        onChanged={refresh}
      />
      <ConnectionRow tile="MU" name="Meetup" readOnly status="none" statusLabel="MOCK" detail={mock} />
      <ConnectionRow tile="HX" name="Humanitix" readOnly status="none" statusLabel="MOCK" detail={mock} />
      <Feeds feeds={feeds} toast={toast} refresh={refresh} />
    </>
  );
}

function OrganizerIds({ initial, discover }: { initial: string[]; discover: boolean | null }) {
  const { toast } = useShell();
  const router = useRouter();
  const [value, setValue] = useState(initial.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    const ids = value.split(",").map((x) => x.trim()).filter(Boolean);
    if (ids.length > 20 || ids.some((i) => !/^\d{1,20}$/.test(i))) return setError("Use numeric organizer IDs separated by commas, up to 20.");
    setError(undefined);
    setBusy(true);
    const r = await saveEventbriteOrganizersAction(ids).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      toast("Organizer IDs saved");
      router.refresh();
    } else toast(FAIL, "error");
  }

  return (
    <div className="flex flex-wrap items-end gap-3 glass-card rounded-24 p-4">
      <div className="min-w-[240px] flex-1">
        <Field
          label="Organizer IDs"
          error={error}
          helper={discover === false ? "With this token LifeOS can only list your own events." : "Events from these organizers appear in Outreach."}
        >
          <Input className="font-code" spellCheck={false} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <Button variant="secondary" loading={busy} onClick={save}>
        Save IDs
      </Button>
    </div>
  );
}

function Feeds({ feeds, toast, refresh }: { feeds: EventSourceDTO[]; toast: (m: string, k?: "success" | "error") => void; refresh: () => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<EventSourceDTO | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return setError("Enter a label and a full https:// address.");
    setError(undefined);
    setBusy(true);
    const r = await addFeedAction(label, url).catch(() => ({ ok: false as const, error: "failed" }));
    setBusy(false);
    if (r.ok) {
      setLabel("");
      setUrl("");
      toast("Feed added");
      refresh();
    } else if ("error" in r && ADD_ERRORS[r.error]) setError(ADD_ERRORS[r.error]);
    else toast(FAIL, "error");
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
    if (!f) return;
    const r = await removeFeedAction(f.id).catch(() => ({ ok: false }));
    if (r.ok) {
      toast("Feed removed");
      refresh();
    } else toast(FAIL, "error");
  }

  return (
    <section id="event-feeds" aria-labelledby="event-feeds-h" className="flex scroll-mt-6 flex-col gap-4 glass-card rounded-24 p-5">
      <SectionHeader id="event-feeds-h" label="EVENT FEEDS" meta={`${feeds.length} ${feeds.length === 1 ? "feed" : "feeds"}`} />
      {feeds.length === 0 ? (
        <p className="text-[13px] text-text-3">No feeds yet. Luma&apos;s Sydney feed is the best place to start.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Checkbox
                  hitArea
                  aria-label={`Sync ${f.label}`}
                  checked={enabled[f.id] ?? f.enabled}
                  onChange={(e) => toggle(f, e.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{f.label}</div>
                  <div className="truncate font-code text-[11.5px] text-text-3">{f.host}</div>
                </div>
                <span className="text-[12.5px] text-text-3">{f.lastSyncAt ? `Synced ${ago(f.lastSyncAt)}` : "Not synced yet"}</span>
                <button
                  type="button"
                  aria-label={`Remove feed ${f.label}`}
                  onClick={() => setConfirm(f)}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-text-3 hover:bg-white/[.06] hover:text-text [@media(pointer:coarse)]:size-11"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              {f.lastSyncError && (
                <p role="alert" className="pl-7 text-[12.5px] text-red">
                  {f.lastSyncError}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-4 border-t border-white/[.10] pt-4">
        <Field label="Label">
          <Input maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="iCal URL" error={error}>
          <Input type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" className="font-code" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div>
          <Button type="submit" loading={busy}>
            Add feed
          </Button>
        </div>
      </form>
      <Disclosure summary={<span className="text-[13px] text-text-2">How to add Luma&apos;s Sydney feed</span>}>
        <p className="mt-2 text-[12.5px] text-text-2">
          Open luma.com/sydney, choose &quot;Add iCal Subscription&quot;, copy the link, and paste it here.
        </p>
      </Disclosure>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Remove feed"
        initialFocus={() => document.getElementById("remove-feed-cancel")}
        actions={
          <>
            <Button id="remove-feed-cancel" variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Remove feed
            </Button>
          </>
        }
      >
        Remove &quot;{confirm?.label}&quot;? Events you haven&apos;t saved from it disappear at the next sync. Saved events stay.
      </Dialog>
    </section>
  );
}
