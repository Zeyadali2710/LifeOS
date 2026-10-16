ALTER TABLE "mail_messages" DROP CONSTRAINT "mail_messages_gmailId_unique";--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "connection_id" text DEFAULT 'google_calendar' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_account_gmail_idx" ON "mail_messages" USING btree ("connection_id","gmail_id");