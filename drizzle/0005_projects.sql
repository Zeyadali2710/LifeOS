CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" text,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_dependencies" (
	"project_id" uuid NOT NULL,
	"blocked_by_project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_dependencies_project_id_blocked_by_project_id_pk" PRIMARY KEY("project_id","blocked_by_project_id"),
	CONSTRAINT "project_dependencies_not_self" CHECK ("project_dependencies"."project_id" <> "project_dependencies"."blocked_by_project_id")
);
--> statement-breakpoint
CREATE TABLE "project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"repo_id" bigint,
	"url" text,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_links_kind_chk" CHECK (("project_links"."kind" = 'repo' and "project_links"."repo_id" is not null and "project_links"."url" is null) or ("project_links"."kind" = 'url' and "project_links"."url" is not null and "project_links"."repo_id" is null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'personal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"target_date" text,
	"workspace_path" text,
	"workspace_machine" text,
	"blocker_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_category_chk" CHECK ("projects"."category" in ('personal','career','startup','technical','social','learning')),
	CONSTRAINT "projects_status_chk" CHECK ("projects"."status" in ('active','paused','done','archived')),
	CONSTRAINT "projects_priority_chk" CHECK ("projects"."priority" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"blocked_by_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_task_id_blocked_by_task_id_pk" PRIMARY KEY("task_id","blocked_by_task_id"),
	CONSTRAINT "task_dependencies_not_self" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."blocked_by_task_id")
);
--> statement-breakpoint
ALTER TABLE "github_repos" ADD COLUMN "languages" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_blocked_by_project_id_projects_id_fk" FOREIGN KEY ("blocked_by_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_repo_id_github_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."github_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocked_by_task_id_tasks_id_fk" FOREIGN KEY ("blocked_by_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "milestones_project_id_sort_order_index" ON "milestones" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_dependencies_blocked_by_project_id_index" ON "project_dependencies" USING btree ("blocked_by_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_links_repo_idx" ON "project_links" USING btree ("project_id","repo_id") WHERE "project_links"."repo_id" is not null;--> statement-breakpoint
CREATE INDEX "project_links_project_id_index" ON "project_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_status_priority_index" ON "projects" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "task_dependencies_blocked_by_task_id_index" ON "task_dependencies" USING btree ("blocked_by_task_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_id_index" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_milestone_id_index" ON "tasks" USING btree ("milestone_id");