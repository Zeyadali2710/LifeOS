import { notFound } from "next/navigation";
import { RepoDetail } from "@/features/career/repo-detail";
import { loadRepoView } from "@/server/career-view";
import { loadRepoDetail } from "@/server/career";
import { db } from "@/server/db/client";
import { requireOwner } from "@/server/session";

export const metadata = { title: "Repository · LifeOS" };
export const dynamic = "force-dynamic";

const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

export default async function RepoPage({ params, searchParams }: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ tab?: string | string[]; branch?: string | string[] }> }) {
  await requireOwner();
  const { owner, repo } = await params;
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) notFound();
  const now = new Date();
  const d = await loadRepoDetail(db(), `${owner}/${repo}`, now);
  if (!d) notFound();
  const query = await searchParams;
  const tab = typeof query.tab === "string" && ["code", "prs", "issues", "actions", "insights"].includes(query.tab) ? query.tab : "code";
  const branch = typeof query.branch === "string" && query.branch.length <= 255 ? query.branch : undefined;
  const extra = await loadRepoView(db(), d.repo.id, d.repo.fullName, branch, tab);
  return <RepoDetail d={d} extra={extra} now={now.toISOString()} tab={tab} />;
}
