CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"remote_id" text NOT NULL,
	"url" text,
	"etag" text,
	"title" text DEFAULT '' NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"start_date" text,
	"end_date" text,
	"tz" text,
	"recurrence" jsonb,
	"recurring_remote_id" text,
	"original_start" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"transparency" text DEFAULT 'opaque' NOT NULL,
	"declined" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"account" text,
	"access" text DEFAULT 'reader' NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"category" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"sync_cursor" text,
	"ctag" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"due_date" text,
	"due_time" text,
	"due_at" timestamp with time zone,
	"priority" integer,
	"remind_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_calendar_id_remote_id_index" ON "calendar_events" USING btree ("calendar_id","remote_id");--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_id_start_at_index" ON "calendar_events" USING btree ("calendar_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_id_recurring_remote_id_index" ON "calendar_events" USING btree ("calendar_id","recurring_remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_connection_id_remote_id_index" ON "calendars" USING btree ("connection_id","remote_id");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_due_at_index" ON "tasks" USING btree ("completed_at","due_at");--> statement-breakpoint
CREATE INDEX "tasks_remind_at_index" ON "tasks" USING btree ("remind_at");