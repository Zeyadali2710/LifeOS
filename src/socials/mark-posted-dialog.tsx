"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPlatform } from "@/lib/social-types";
import { markPosted } from "@/server/socials-actions";
import { useShell } from "@/shell/shell-provider";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/field";
import { safePostUrl } from "./model";
import { PLATFORM } from "./platform";

export function MarkPostedDialog({ id, platform, onClose }: { id: string; platform: SocialPlatform; onClose(): void }) {
  const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const { toast } = useShell(); const router = useRouter();
  const save = async () => {
    if (url.trim() && !safePostUrl(platform, url.trim())) { setError(`Use an https link ${PLATFORM[platform].host ? `on ${PLATFORM[platform].host}` : "to your live post"}.${platform === "tiktok" ? " Paste the full video URL containing /video/ and its ID." : ""}`); return; }
    setBusy(true); const r = await markPosted(id, url.trim() || undefined).catch(() => ({ ok: false })); setBusy(false);
    if (!r.ok) { setError("Couldn't save that. Try again."); return; }
    toast("Marked as posted"); onClose(); router.refresh();
  };
  return <Dialog open sheet title={`Mark as posted on ${PLATFORM[platform].label}`} onClose={() => { if (!busy) onClose(); }} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Mark as posted</Button></>}><div className="mt-4 space-y-3"><Field label="Post URL (optional)" helper={platform === "tiktok" ? "Paste the video link so LifeOS can match its stats." : "Paste the live link to keep it with the post."}><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>{error && <p role="alert" className="text-red">{error}</p>}</div></Dialog>;
}
