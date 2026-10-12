-- Keep one default (the oldest) if a past race left several, so the index below can be created.
UPDATE "calendars" SET "is_default" = false WHERE "is_default" AND "id" <> (SELECT "id" FROM "calendars" WHERE "is_default" ORDER BY "created_at", "id" LIMIT 1);--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_one_default_idx" ON "calendars" USING btree ("is_default") WHERE "calendars"."is_default";
