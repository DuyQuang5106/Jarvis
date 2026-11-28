ALTER TABLE "conversations" ADD COLUMN "kind" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_general_idx" ON "conversations" USING btree ("kind") WHERE "conversations"."kind" = 'general';--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_per_area_idx" ON "conversations" USING btree ("area_id") WHERE "conversations"."kind" = 'area';--> statement-breakpoint
UPDATE "conversations" SET "kind" = 'system' WHERE "id" IN (SELECT "conversation_id" FROM "weekly_reviews" WHERE "conversation_id" IS NOT NULL);
