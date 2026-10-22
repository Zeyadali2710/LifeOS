"use client";

import { useState } from "react";
import { saveInterestsAction } from "@/server/outreach-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Button } from "@/legacy-ui/button";
import { Input } from "@/legacy-ui/field";
import { Icon } from "@/legacy-ui/icon";

const label = "font-mono text-[11px] font-medium tracking-[0.12em] text-text-3 uppercase";

export function OutreachSection({ interests }: { interests: string[] }) {
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
    if (!v) return;
    if (v.length > 40) return setError("Keep it under 40 characters.");
    if (list.some((i) => i.toLowerCase() === v.toLowerCase())) return setError("That interest is already in the list.");
    if (list.length >= 20) return setError("You can have up to 20 interests.");
    setError(undefined);
    setValue("");
    void save([...list, v]);
  }

  return (
    <section aria-labelledby="interests-h" className="flex flex-col gap-4 glass-card rounded-24 p-5">
      <h2 id="interests-h" className={label}>
        INTERESTS
      </h2>
      <p className="text-[13.5px] text-text-2">Events are scored against these. They&apos;re also the filter chips on Outreach.</p>
      {list.length === 0 ? (
        <p className="text-[13px] text-text-3">No interests yet. Without them, only projects and your schedule affect scores.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((i) => (
            <li key={i} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[.06] pr-1.5 pl-3.5 text-[13px]">
              {i}
              <button
                type="button"
                aria-label={`Remove ${i}`}
                disabled={busy}
                onClick={() => void save(list.filter((x) => x !== i))}
                className="grid size-6 place-items-center rounded-full text-text-3 hover:bg-white/[.10] hover:text-text disabled:opacity-50 [@media(pointer:coarse)]:size-8"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex max-w-[360px] min-w-[200px] flex-1 flex-col gap-1.5">
          <Input
            aria-label="New interest"
            maxLength={40}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "interest-err" : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
          />
          {error && (
            <p id="interest-err" className="text-[12.5px] text-red">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="secondary" size="sm" className="mt-1" disabled={busy}>
          Add interest
        </Button>
      </form>
    </section>
  );
}
