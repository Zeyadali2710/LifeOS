import { notFound } from "next/navigation";
import { RepoDetail } from "@/career/repo-detail";
import { loadRepoDetail } from "@/server/career";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Repository · LifeOS" };
export const dynamic = "force-dynamic";

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

export default async function RepoPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  await requireOwner();
  const { owner, repo } = await params;
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) notFound();
  const now = new Date();
  const d = await loadRepoDetail(db(), `${owner}/${repo}`, now);
  if (!d) notFound();
  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-8">
      <RepoDetail d={d} now={now.toISOString()} />
    </div>
  );
}
