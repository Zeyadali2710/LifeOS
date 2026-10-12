import Link from "next/link";
import type { RepoCardDTO } from "@/lib/project-types";
import { CiChipView } from "@/projects/status";
import { Badge } from "@/ui/badge";
import { LanguageBar } from "./language-bar";
import { Sparkline } from "./sparkline";

export function relativeTime(iso: string | null, now: string): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.floor((new Date(now).getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export function RepoCard({ repo, now, compact = false }: { repo: RepoCardDTO; now: string; compact?: boolean }) {
  const [fallbackOwner] = repo.fullName.split("/");
  const href = `/career/${repo.owner ?? fallbackOwner}/${repo.name}`;
  const pushed = `Pushed ${relativeTime(repo.pushedAt, now)}`;
  const spark = <Sparkline data={repo.sparkline} label={`Commits, last 14 days: ${repo.commits14} total`} />;
  return (
    <Link
      href={href}
      title={repo.fullName}
      aria-label={repo.fullName}
      className={`flex flex-col gap-3 glass-card rounded-24 text-text transition duration-150 hover:-translate-y-px hover:border-white/[.16] ${compact ? "p-4" : "p-5"}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-display text-[20px] leading-[1.2]">{repo.name}</span>
        <CiChipView ci={repo.ci} />
      </span>
      {compact ? (
        <>
          {spark}
          <span className="text-[12.5px] text-text-3">{pushed}</span>
        </>
      ) : (
        <>
          {repo.description && <span className="line-clamp-2 text-[14px] text-text-2">{repo.description}</span>}
          {repo.languages.length > 0 ? (
            <>
              <LanguageBar slices={repo.languages} />
              {repo.primaryLanguage && <span className="text-[12.5px] text-text-2">{repo.primaryLanguage}</span>}
            </>
          ) : (
            <span className="text-[12.5px] text-text-3">Language unknown</span>
          )}
          {spark}
          {repo.commits14 === 0 && <span className="text-[12.5px] text-text-3">No commits in 14 days</span>}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-text-3">
            {repo.synced ? (
              <span>
                {repo.openPrs} PRs · {repo.openIssues} your issues · {pushed}
              </span>
            ) : (
              <span>Not synced · {pushed}</span>
            )}
            {repo.archived && (
              <Badge kind="status" tone="neutral">
                Archived
              </Badge>
            )}
          </span>
        </>
      )}
    </Link>
  );
}
