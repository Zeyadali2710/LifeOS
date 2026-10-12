// Client-safe: no server imports.
import type { TaskDTO } from "./calendar-types";

export const PROJECT_CATEGORIES = ["personal", "career", "startup", "technical", "social", "learning"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  personal: "Personal",
  career: "Career",
  startup: "Startup",
  technical: "Technical",
  social: "Social",
  learning: "Learning",
};

export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  done: "Done",
  archived: "Archived",
};

export type Health = "on_track" | "at_risk" | "behind";
export const HEALTH_LABEL: Record<Health, string> = { on_track: "On track", at_risk: "At risk", behind: "Behind" };
export type CiChip = "passing" | "failing" | "running" | "none";

export interface LanguageSlice {
  name: string;
  pct: number;
  color: string;
}

export interface Progress {
  pct: number | null;
  done: number;
  total: number;
  basis: "tasks" | "milestones" | "none";
}

export interface RepoCardDTO {
  id: number;
  fullName: string;
  owner: string | null;
  name: string;
  description: string | null;
  htmlUrl: string | null;
  defaultBranch: string | null;
  private: boolean;
  archived: boolean;
  primaryLanguage: string | null;
  languages: LanguageSlice[];
  ci: CiChip;
  pushedAt: string | null;
  openPrs: number;
  openIssues: number;
  sparkline: number[];
  commits14: number;
  /** false = outside the sync's active window; UI shows "Not synced" instead of zeros. */
  synced: boolean;
}

export interface ActivityItemDTO {
  id: string;
  kind: "commit" | "pr" | "issue" | "ci" | "task";
  title: string;
  repo: string | null;
  actor: string | null;
  at: string;
  href: string | null;
  external: boolean;
  ci: CiChip | null;
}

export interface CareerDTO {
  connection: { status: "none" | "connected" | "error"; lastSyncAt: string | null; lastSyncError: string | null };
  repos: RepoCardDTO[];
  activity: ActivityItemDTO[];
  tiles: { repos: number; openPrs: number; openIssues: number; ciFailing: number };
}

export interface RepoDetailDTO {
  repo: RepoCardDTO;
  pulls: {
    number: number;
    title: string;
    author: string | null;
    url: string | null;
    review: "approved" | "changes_requested" | "review_required" | "draft";
  }[];
  issues: { number: number; title: string; author: string | null; url: string | null }[];
  runs: { id: number; name: string | null; branch: string | null; ci: CiChip; url: string | null; at: string | null }[];
  commits: { sha: string; message: string; author: string | null; url: string | null; at: string | null }[];
  projects: { id: string; name: string }[];
}

export interface ProjectDTO {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  status: ProjectStatus;
  priority: 1 | 2 | 3;
  targetDate: string | null;
  workspacePath: string | null;
  workspaceMachine: string | null;
  blockerNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDTO {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  taskCount: number;
  doneCount: number;
}

export interface BlockerDTO {
  kind: "task_blocked" | "project_blocked" | "milestone_overdue" | "ci_failing";
  refId: string;
  label: string;
  href: string | null;
}

export type ProjectLinkDTO =
  | { id: string; kind: "repo"; repo: RepoCardDTO }
  | { id: string; kind: "url"; label: string; url: string };

export interface ProjectCardDTO {
  project: ProjectDTO;
  progress: Progress;
  health: Health | null;
  nextTask: { title: string; dueDate: string | null } | null;
  openTasks: number;
  lastActivity: { at: string; label: string } | null;
  repoSparkline: number[] | null;
  timeline: { pct: number; daysLeft: number } | null;
  blocked: boolean;
}

export interface ProjectWorkspaceDTO {
  project: ProjectDTO;
  progress: Progress;
  health: Health | null;
  healthReason: string;
  tasks: TaskDTO[];
  /** open task id -> titles of its incomplete blockers */
  blockedBy: Record<string, string[]>;
  milestones: MilestoneDTO[];
  blockers: BlockerDTO[];
  links: ProjectLinkDTO[];
  dependsOn: { id: string; name: string; status: ProjectStatus }[];
  activity: ActivityItemDTO[];
  brief: string;
  launchCommand: string | null;
  primaryRepoUrl: string | null;
  githubConnected: boolean;
}

export interface TaskDialogOptions {
  projects: { id: string; name: string; milestones: { id: string; title: string }[] }[];
  tasks: { id: string; title: string }[];
  blockedBy: { id: string; title: string }[];
}
