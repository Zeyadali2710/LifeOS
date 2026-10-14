CREATE TABLE "social_account_snapshots" (
	"platform" text NOT NULL,
	"date" text NOT NULL,
	"followers" integer,
	"posts" integer,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_account_snapshots_platform_date_pk" PRIMARY KEY("platform","date"),
	CONSTRAINT "social_snapshots_platform_chk" CHECK ("social_account_snapshots"."platform" in ('linkedin','instagram','tiktok','portfolio')),
	CONSTRAINT "social_snapshots_date_chk" CHECK ("social_account_snapshots"."date" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source_kind" text,
	"source_id" text,
	"stage" text DEFAULT 'idea' NOT NULL,
	"created_by" text DEFAULT 'owner' NOT NULL,
	"drafted_from_content" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_source_kind_chk" CHECK ("social_posts"."source_kind" is null or "social_posts"."source_kind" in ('project','outreach_event','repo')),
	CONSTRAINT "social_posts_stage_chk" CHECK ("social_posts"."stage" in ('idea','draft')),
	CONSTRAINT "social_posts_created_by_chk" CHECK ("social_posts"."created_by" in ('owner','agent')),
	CONSTRAINT "social_posts_source_pair_chk" CHECK (("social_posts"."source_kind" is null) = ("social_posts"."source_id" is null))
);
--> statement-breakpoint
CREATE TABLE "social_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"image_url" text,
	"link_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"approval_id" uuid,
	"approved_text_hash" text,
	"approved_provider_mode" text,
	"approved_connection_generation" uuid,
	"remote_id" text,
	"remote_url" text,
	"container_id" text,
	"is_mock" boolean DEFAULT false NOT NULL,
	"metrics" jsonb,
	"metrics_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_variants_platform_chk" CHECK ("social_variants"."platform" in ('linkedin','instagram','tiktok','portfolio')),
	CONSTRAINT "social_variants_status_chk" CHECK ("social_variants"."status" in ('draft','pending_approval','scheduled','publishing','published','failed','posted_manually')),
	CONSTRAINT "social_variants_mode_chk" CHECK ("social_variants"."approved_provider_mode" is null or "social_variants"."approved_provider_mode" in ('mock','real'))
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "credential_generation" uuid;--> statement-breakpoint
ALTER TABLE "social_variants" ADD CONSTRAINT "social_variants_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_variants" ADD CONSTRAINT "social_variants_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_posts_stage_updated_at_index" ON "social_posts" USING btree ("stage","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "social_variants_post_platform_uniq" ON "social_variants" USING btree ("post_id","platform");--> statement-breakpoint
CREATE INDEX "social_variants_status_scheduled_at_index" ON "social_variants" USING btree ("status","scheduled_at");