"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { boardColumn, type PostStage, type SocialPlatform, type VariantStatus } from "@/lib/social-types";
import { moveStage } from "@/server/socials-actions";
import { useShell } from "@/features/shell/shell-provider";
import { Badge } from "@/legacy-ui/badge";
import { Button } from "@/legacy-ui/button";
import { SectionHeader } from "@/legacy-ui/section-header";
import { PlatformChip } from "./platform-chip";
import type { SocialsData } from "./socials-view";
import { stamp } from "./model";

const COLUMNS = ["Ideas", "Draft", "Review", "Scheduled", "Published"] as const;
const COLORS = ["#8e8e93", "#64d2ff", "#ff9f0a", "#64d2ff", "#30d158"];
export function ContentBoard({ posts, onOpen, onNew }: { posts: SocialsData["board"]; onOpen(id: string): void; onNew(agent: boolean): void }) {
  const router = useRouter(); const { toast } = useShell(); const [pending, start] = useTransition();
  const [items, optimistic] = useOptimistic(posts, (all, change: { id: string; stage: PostStage }) => all.map((p) => p.id === change.id ? { ...p, stage: change.stage } : p));
  const move = (id: string, stage: PostStage) => start(async () => {
    optimistic({ id, stage }); const r = await moveStage(id, stage).catch(() => ({ ok: false }));
    if (!r.ok) toast("Couldn't save that. Try again.", "error"); router.refresh();
  });
  return <section aria-labelledby="content-pipeline" className="mt-8">
    <SectionHeader id="content-pipeline" label="Content pipeline" meta={`${posts.length} POSTS`} action={<div className="flex flex-wrap gap-2"><Button variant="ai" size="sm" onClick={() => onNew(true)}>Draft with Social agent</Button><Button size="sm" onClick={() => onNew(false)}>New idea</Button></div>} />
    <div className="grid grid-cols-1 items-start gap-3 tab:grid-cols-[repeat(5,minmax(210px,1fr))] tab:overflow-x-auto">
      {COLUMNS.map((column, index) => {
        const rows = items.filter((p) => boardColumn(p.stage as PostStage, p.variants.map((v) => v.status as VariantStatus)) === column);
        return <section key={column} aria-labelledby={`column-${column}`} className="glass-card rounded-24 p-3"><header className="mb-3 flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: COLORS[index] }} /><h3 id={`column-${column}`} className="text-[11px] tracking-[.14em] text-text-3 uppercase">{column}</h3><Badge kind="count" tone="neutral">{rows.length}</Badge></header>
          {!rows.length && <p className="py-5 text-[12.5px] text-text-3">{column === "Review" ? "Nothing waiting for review." : "Empty. Move a card here or ask the Social Agent."}</p>}
          <ol className="space-y-2">{rows.map((post) => {
            const at = post.variants.filter((v) => v.status === "scheduled" && v.scheduledAt).map((v) => v.scheduledAt!).sort((a, b) => +a - +b)[0] ?? post.variants.find((v) => v.publishedAt)?.publishedAt;
            const views = post.variants.filter((v) => !v.isMock && typeof v.metrics?.views === "number");
            return <li key={post.id} className="flex flex-col gap-2 rounded-16 border border-white/[.06] bg-white/[.03] p-3"><div className="flex flex-wrap gap-1">{post.variants.map((v) => <PlatformChip key={v.id} platform={v.platform as SocialPlatform} />)}</div>
              {at && <p className="text-[12.5px] text-text-3">{stamp(at)}</p>}
              <button type="button" className="text-left text-[13.5px] font-medium" aria-label={`Open post ${post.title}`} onClick={() => onOpen(post.id)}>{post.title}</button>
              <p className="text-[12.5px] text-text-3">{post.createdBy === "agent" ? "Social agent" : "You"} {post.variants.some((v) => v.isMock || v.approvedProviderMode === "mock") && <Badge kind="tag" tone="amber">MOCK</Badge>}</p>
              {column === "Published" && !!views.length && <p className="text-[12.5px] text-text-2">{views.reduce((sum, v) => sum + v.metrics!.views!, 0).toLocaleString("en-AU")} views</p>}
              {column === "Ideas" && <Button variant="secondary" size="xs" disabled={pending} aria-label={`Move ${post.title} to Draft`} onClick={() => move(post.id, "draft")}>Start draft</Button>}
              {column === "Draft" && <Button variant="ghost" size="xs" disabled={pending} aria-label={`Move ${post.title} back to Ideas`} onClick={() => move(post.id, "idea")}>Back</Button>}
              {post.variants.filter((v) => v.status === "pending_approval" && v.approvalId).map((v) => <Link key={v.id} className="text-[12.5px] text-cyan" href={`/approvals?id=${v.approvalId}`}>Review {v.platform} approval</Link>)}
            </li>;
          })}</ol></section>;
      })}
    </div>
  </section>;
}
