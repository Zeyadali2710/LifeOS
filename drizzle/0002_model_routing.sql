CREATE TABLE "run_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "route_mode" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "route_events" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "saw_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "run_turns" ADD CONSTRAINT "run_turns_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_turns_run_id_index" ON "run_turns" USING btree ("run_id");
--> statement-breakpoint
INSERT INTO "run_turns" ("run_id","seq","model","input_tokens","output_tokens","cache_write_tokens","cache_read_tokens","cost_usd","created_at") SELECT id, 1, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd, coalesce(started_at, created_at) FROM "agent_runs" WHERE input_tokens + output_tokens + cache_write_tokens + cache_read_tokens > 0 OR cost_usd > 0;
--> statement-breakpoint
-- backfill: saw_private
UPDATE "agent_runs" r SET "saw_private" = true WHERE EXISTS (SELECT 1 FROM "github_repos" g WHERE g."private" IS NOT FALSE AND (position(lower(g."full_name") in lower(r."prompt")) > 0 OR EXISTS (SELECT 1 FROM "tool_calls" c WHERE c."run_id" = r."id" AND c."output" IS NOT NULL AND position(lower(g."full_name") in lower(c."output"::text)) > 0)));
