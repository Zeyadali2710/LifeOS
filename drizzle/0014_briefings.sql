CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"headline" text NOT NULL,
	"body" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefings_kind_chk" CHECK ("briefings"."kind" in ('morning','midday','evening','weekly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "briefings_kind_period_idx" ON "briefings" USING btree ("kind","period");--> statement-breakpoint
CREATE INDEX "briefings_created_at_index" ON "briefings" USING btree ("created_at");