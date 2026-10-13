"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { importEventUrlAction } from "@/server/outreach-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/field";

const ERRORS: Record<string, string> = {
  invalid: "Enter a full https:// address.",
  blocked: "That address isn't allowed. Use a public https link.",
  unreachable: "Couldn't reach that page. Try again later.",
  too_large: "That page is too large to read.",
  no_event: "No event data found on that page.",
};

export function ImportUrlDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Form onClose={onClose} />;
}

function Form({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useShell();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const r = await importEventUrlAction(url).catch(() => ({ ok: false, error: "failed" }) as const);
    setBusy(false);
    if (!r.ok) {
      setError(ERRORS[r.error]);
      if (!ERRORS[r.error]) toast("Couldn't save that. Try again.", "error");
      return;
    }
    toast(r.existed ? "Already in your events" : "Event saved");
    onClose();
    router.push(`/outreach/events/${r.id}`);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Import an event"
      sheet
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Import event
          </Button>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Event page URL" error={error} helper="Works with pages that publish event details, like Eventbrite, Humanitix, Meetup and Luma.">
          <Input type="url" inputMode="url" placeholder="https://" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
