"use client";
import s from "./settings.module.css";
import { useState } from "react";
import { saveInterestsAction } from "@/server/outreach-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button, IconButton } from "@/ui/button";
import { TextField } from "@/ui/controls";
import { Section } from "@/ui/layout";
import { EmptyState } from "@/ui/feedback";
export function OutreachSection({ interests }: {
  interests: string[];
}) {
  const { toast } = useShell();
  const [list, setList] = useState(interests);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function save(next: string[]) {
    const prev = list;
    setList(next);
    setBusy(true);
    const r = await saveInterestsAction(next).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) {
      setList(prev);
      return toast("Couldn't save that. Try again.", "error");
    }
    toast("Interests saved. Scores update shortly.");
  }
  function add() {
    const v = value.trim();
    if (!v)
      return;
    if (v.length > 40)
      return setError("Keep it under 40 characters.");
    if (list.some((i) => i.toLowerCase() === v.toLowerCase()))
      return setError("That interest is already in the list.");
    if (list.length >= 20)
      return setError("You can have up to 20 interests.");
    setError(undefined);
    setValue("");
    void save([...list, v]);
  }
  return (<Section id="interests-h" label="Interests">
    <p className={s.body}>Events are scored against these. They&apos;re also the filter chips on Outreach. Triage runs on new INBOX mail in batches of 10; bulk mail is classified by rule.</p>
    {list.length === 0 ? <EmptyState title="No interests yet" body="Without them, only projects and your schedule affect scores." /> : <ul className={s.chips}>
      {list.map(i => <li key={i} className={s.chip}>
        {i}<IconButton icon="close" label={`Remove ${i}`} small disabled={busy} onClick={() => void save(list.filter(x => x !== i))} />
      </li>)}
    </ul>}<form className={s.actions} onSubmit={e => { e.preventDefault(); add(); }}>
      <TextField label="New interest" maxLength={40} value={value} error={error} onChange={e => { setValue(e.target.value); setError(undefined); }} />
      {error && <p role="alert" className={s.error}>
        {error}
      </p>}<Button type="submit" disabled={busy}>Add interest</Button>
    </form>
    <a className={s.link} href="/settings?section=connections#event-feeds">Manage event sources and iCal feeds</a>
  </Section>);
}
