CREATE TABLE "event_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"url_ciphertext" text,
	"host" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sources_kind_chk" CHECK ("event_sources"."kind" in ('ics','eventbrite','luma','meetup_mock','humanitix_mock'))
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"from_address" text DEFAULT '' NOT NULL,
	"to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"label_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"bulk" boolean DEFAULT false NOT NULL,
	"category" text,
	"importance" text,
	"summary" text,
	"action" text,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"triaged_at" timestamp with time zone,
	"triage_model" text,
	"archived_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_messages_gmailId_unique" UNIQUE("gmail_id"),
	CONSTRAINT "mail_messages_category_chk" CHECK ("mail_messages"."category" is null or "mail_messages"."category" in ('IMPORTANT','EVENTS','NETWORKING','OPPORTUNITIES','FOLLOW-UP','OTHER')),
	CONSTRAINT "mail_messages_importance_chk" CHECK ("mail_messages"."importance" is null or "mail_messages"."importance" in ('HIGH','MEDIUM','LOW'))
);
--> statement-breakpoint
CREATE TABLE "outreach_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_key" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"time_zone" text,
	"location" text,
	"lat" double precision,
	"lng" double precision,
	"online" boolean DEFAULT false NOT NULL,
	"organizer" text,
	"price_text" text,
	"url" text,
	"canonical_url" text,
	"description" text DEFAULT '' NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_mock" boolean NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb,
	"score" integer DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"stage" text,
	"stage_changed_at" timestamp with time zone,
	"calendar_event_id" uuid,
	"dismissed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_events_stage_chk" CHECK ("outreach_events"."stage" is null or "outreach_events"."stage" in ('SAVED','INTERESTED','ATTENDING','ATTENDED','FOLLOW_UP'))
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "outreach_event_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "mail_message_id" uuid;--> statement-breakpoint
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_sources_builtin_uniq" ON "event_sources" USING btree ("kind") WHERE "event_sources"."kind" <> 'ics';--> statement-breakpoint
CREATE INDEX "mail_messages_received_at_index" ON "mail_messages" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "mail_messages_thread_id_index" ON "mail_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mail_messages_category_index" ON "mail_messages" USING btree ("category");--> statement-breakpoint
CREATE INDEX "outreach_events_title_key_start_at_index" ON "outreach_events" USING btree ("title_key","start_at");--> statement-breakpoint
CREATE INDEX "outreach_events_canonical_url_index" ON "outreach_events" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "outreach_events_start_at_index" ON "outreach_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "outreach_events_stage_index" ON "outreach_events" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "outreach_events_sources_gin" ON "outreach_events" USING gin ("sources" jsonb_path_ops);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_outreach_event_id_outreach_events_id_fk" FOREIGN KEY ("outreach_event_id") REFERENCES "public"."outreach_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_mail_message_id_mail_messages_id_fk" FOREIGN KEY ("mail_message_id") REFERENCES "public"."mail_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_outreach_event_id_index" ON "tasks" USING btree ("outreach_event_id");--> statement-breakpoint
CREATE INDEX "tasks_mail_message_id_index" ON "tasks" USING btree ("mail_message_id");