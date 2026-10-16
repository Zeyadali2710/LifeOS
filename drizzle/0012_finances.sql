CREATE TABLE "finance_budgets" (
	"category" text NOT NULL,
	"month" text NOT NULL,
	"cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_budgets_category_month_pk" PRIMARY KEY("category","month"),
	CONSTRAINT "finance_budget_cents_chk" CHECK ("finance_budgets"."cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"name" text PRIMARY KEY NOT NULL,
	"group" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_category_kind_chk" CHECK ("finance_categories"."kind" in ('income','expense','savings','investment','transfer'))
);
--> statement-breakpoint
CREATE TABLE "finance_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account" text NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"imported" integer NOT NULL,
	"skipped" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_rules" (
	"keyword" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"account" text NOT NULL,
	"date" text NOT NULL,
	"precision" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"balance" integer,
	"external_id" text,
	"fingerprint" text NOT NULL,
	"category" text,
	"category_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_precision_chk" CHECK ("finance_transactions"."precision" in ('day','month')),
	CONSTRAINT "finance_source_chk" CHECK ("finance_transactions"."category_source" in ('csv','rule','manual','unclassified'))
);
--> statement-breakpoint
ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_category_finance_categories_name_fk" FOREIGN KEY ("category") REFERENCES "public"."finance_categories"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_category_finance_categories_name_fk" FOREIGN KEY ("category") REFERENCES "public"."finance_categories"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_import_id_finance_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."finance_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_category_finance_categories_name_fk" FOREIGN KEY ("category") REFERENCES "public"."finance_categories"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_import_file_uniq" ON "finance_imports" USING btree ("account","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_transaction_fingerprint_uniq" ON "finance_transactions" USING btree ("account","fingerprint");--> statement-breakpoint
CREATE INDEX "finance_transactions_date_index" ON "finance_transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "finance_transactions_category_index" ON "finance_transactions" USING btree ("category");