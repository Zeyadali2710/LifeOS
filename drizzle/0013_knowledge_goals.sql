CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"color" text DEFAULT '#0a84ff' NOT NULL,
	"target_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_status_chk" CHECK ("goals"."status" in ('active','done','archived'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"project_id" uuid,
	"viewed_at" timestamp with time zone,
	"embedding" vector(1536),
	"embedded_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_items_kind_chk" CHECK ("knowledge_items"."kind" in ('note','document','bookmark','idea','research')),
	CONSTRAINT "knowledge_items_source_chk" CHECK ("knowledge_items"."source" in ('manual','upload','agent'))
);
--> statement-breakpoint
CREATE TABLE "objective_projects" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"objective_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"progress" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objectives_status_chk" CHECK ("objectives"."status" in ('active','done')),
	CONSTRAINT "objectives_progress_chk" CHECK ("objectives"."progress" is null or "objectives"."progress" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_projects" ADD CONSTRAINT "objective_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_projects" ADD CONSTRAINT "objective_projects_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_items_search_idx" ON "knowledge_items" USING gin (to_tsvector('simple', "title" || ' ' || "body"));--> statement-breakpoint
CREATE INDEX "knowledge_items_kind_updated_at_index" ON "knowledge_items" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_items_viewed_at_index" ON "knowledge_items" USING btree ("viewed_at");--> statement-breakpoint
CREATE INDEX "knowledge_items_tags_idx" ON "knowledge_items" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "objective_projects_objective_id_index" ON "objective_projects" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "objectives_goal_id_sort_order_index" ON "objectives" USING btree ("goal_id","sort_order");