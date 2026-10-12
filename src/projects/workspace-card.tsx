"use client";

import { useEffect, useRef, useState } from "react";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";

type Kind = "context" | "launch";

export function WorkspaceCard({
  path,
  machine,
  brief,
  launchCommand,
  primaryRepoUrl,
  onSetWorkspace,
}: {
  path: string | null;
  machine: string | null;
  brief: string;
  launchCommand: string | null;
  primaryRepoUrl: string | null;
  onSetWorkspace: () => void;
}) {
  const { toast } = useShell();
  const [copied, setCopied] = useState<Kind | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (kind: Kind, text: string) => {
    const fail = () => toast("Couldn't copy. Select the text and copy it manually.", "error");
    if (!navigator.clipboard) return fail();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return fail();
    }
    setCopied(kind);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
    toast(kind === "launch" ? "Copied launch command" : "Copied context brief");
  };

  return (
    <div className="glass-card relative overflow-hidden rounded-24 border border-[rgba(100,210,255,.30)] p-5 before:pointer-events-none before:absolute before:inset-0 before:bg-[rgba(100,210,255,.05)]">
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="font-mono text-[11px] font-medium tracking-[0.1em] text-text-2">CLAUDE CODE WORKSPACE</h3>
          <span className="flex-1" />
          <span
            title="LifeOS can't see Claude Code sessions on your machine."
            className="rounded-full bg-white/[.07] px-2 py-[3px] font-mono text-[10.5px] tracking-[0.08em] text-text-2 uppercase"
          >
            Not connected live
            <span className="sr-only">. LifeOS can&apos;t see Claude Code sessions on your machine.</span>
          </span>
        </div>

        {!path ? (
          <>
            <p className="text-[13.5px] text-text-2">Add the folder this project lives in on your machine to get a launch command and a context brief.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={onSetWorkspace}>
              Set workspace
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span title={path} className="min-w-0 truncate font-code text-[11.5px] text-text-2">
                {path}
              </span>
              {machine && <span className="rounded-full bg-white/[.07] px-2 py-[2px] text-[10.5px] text-text-2">{machine}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void copy("context", brief)}>
                <Icon name={copied === "context" ? "check" : "content_copy"} size={14} />
                {copied === "context" ? "Copied" : "Copy context"}
              </Button>
              {launchCommand && (
                <Button size="sm" onClick={() => void copy("launch", launchCommand)}>
                  <Icon name={copied === "launch" ? "check" : "terminal"} size={14} />
                  {copied === "launch" ? "Copied" : "Copy launch command"}
                </Button>
              )}
              {primaryRepoUrl && (
                <a
                  href={primaryRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[12.5px] font-medium text-text-2 hover:bg-white/[.06] hover:text-text"
                >
                  <Icon name="open_in_new" size={14} />
                  Open on GitHub
                </a>
              )}
            </div>
            <p role="status" aria-live="polite" className="sr-only">
              {copied ? "Copied" : ""}
            </p>
            {launchCommand && <code className="mt-3 block font-code text-[11.5px] break-all text-text-2 select-all">{launchCommand}</code>}
            <div
              tabIndex={0}
              role="region"
              aria-label="Context brief preview"
              className="mt-3 max-h-[220px] overflow-auto rounded-14 border border-white/[.08] bg-white/[.03] p-4 font-code text-[11.5px] whitespace-pre-wrap text-text-2"
            >
              {brief}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
