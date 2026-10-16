CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"trigger_ref" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"agent_run_id" uuid,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_status_chk" CHECK ("automation_runs"."status" in ('running','done','failed','skipped'))
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger" jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"headline" text NOT NULL,
	"body" jsonb NOT NULL,
	"scheduled" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefings_kind_chk" CHECK ("briefings"."kind" in ('morning','midday','evening','weekly'))
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_trigger_idx" ON "automation_runs" USING btree ("automation_id","trigger_ref");--> statement-breakpoint
CREATE INDEX "automation_runs_status_updated_at_index" ON "automation_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_id_created_at_index" ON "automation_runs" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "briefings_kind_period_idx" ON "briefings" USING btree ("kind","period");--> statement-breakpoint
CREATE INDEX "briefings_created_at_index" ON "briefings" USING btree ("created_at");