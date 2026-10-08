CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'executing', 'executed', 'failed', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."tool_call_status" AS ENUM('running', 'done', 'failed', 'waiting_approval', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tool_tier" AS ENUM('READ', 'PREPARE', 'APPROVE', 'EXECUTE', 'HIGH_RISK');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"thread_id" uuid,
	"parent_run_id" uuid,
	"retry_of" uuid,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" text,
	"error" text,
	"error_kind" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"active_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"first_tool_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_call_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"tool" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"original_payload" jsonb NOT NULL,
	"edited_payload" jsonb,
	"payload_hash" text NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"ambiguous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"last4" text NOT NULL,
	"login" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"repos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_commits" (
	"sha" text PRIMARY KEY NOT NULL,
	"repo_id" bigint,
	"message" text,
	"author_login" text,
	"committed_at" timestamp with time zone,
	"html_url" text
);
--> statement-breakpoint
CREATE TABLE "github_etags" (
	"url" text PRIMARY KEY NOT NULL,
	"etag" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_issues" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repo_id" bigint,
	"number" integer,
	"title" text,
	"state" text,
	"author_login" text,
	"assignees" jsonb DEFAULT '[]'::jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"html_url" text,
	"gh_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_pull_requests" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repo_id" bigint,
	"number" integer,
	"title" text,
	"state" text,
	"draft" boolean,
	"merged" boolean DEFAULT false,
	"merged_at" timestamp with time zone,
	"author_login" text,
	"html_url" text,
	"requested_reviewers" jsonb DEFAULT '[]'::jsonb,
	"reviews" jsonb DEFAULT '[]'::jsonb,
	"gh_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repos" (
	"id" bigint PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"owner" text,
	"name" text,
	"private" boolean,
	"default_branch" text,
	"html_url" text,
	"description" text,
	"language" text,
	"archived" boolean DEFAULT false,
	"pushed_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_repos_fullName_unique" UNIQUE("full_name")
);
--> statement-breakpoint
CREATE TABLE "github_workflow_runs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"repo_id" bigint,
	"name" text,
	"branch" text,
	"status" text,
	"conclusion" text,
	"html_url" text,
	"head_sha" text,
	"gh_created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"agent_id" text NOT NULL,
	"tool" text NOT NULL,
	"tier" "tool_tier" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_agent_id_tool_pk" PRIMARY KEY("agent_id","tool")
);
--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_use_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text DEFAULT 'tool' NOT NULL,
	"tool" text NOT NULL,
	"tier" "tool_tier" NOT NULL,
	"status" "tool_call_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"input_summary" text,
	"output_summary" text,
	"error" text,
	"idempotency_key" text,
	"child_run_id" uuid,
	"started_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_run_id_agent_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tool_call_id_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."tool_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_workflow_runs" ADD CONSTRAINT "github_workflow_runs_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_agent_id_created_at_index" ON "agent_runs" USING btree ("agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_status_index" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_created_at_index" ON "agent_runs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_thread_id_index" ON "agent_runs" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "agent_runs_started_at_index" ON "agent_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "approvals_status_expires_at_index" ON "approvals" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "approvals_created_at_index" ON "approvals" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "github_commits_repo_id_committed_at_index" ON "github_commits" USING btree ("repo_id","committed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "github_issues_repo_id_number_index" ON "github_issues" USING btree ("repo_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_requests_repo_id_number_index" ON "github_pull_requests" USING btree ("repo_id","number");--> statement-breakpoint
CREATE INDEX "github_workflow_runs_repo_id_gh_created_at_index" ON "github_workflow_runs" USING btree ("repo_id","gh_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "thread_messages_thread_id_created_at_index" ON "thread_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "threads_updated_at_index" ON "threads" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tool_calls_idempotency_key_index" ON "tool_calls" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_calls_run_id_tool_use_id_index" ON "tool_calls" USING btree ("run_id","tool_use_id");--> statement-breakpoint
CREATE INDEX "tool_calls_run_id_seq_index" ON "tool_calls" USING btree ("run_id","seq");