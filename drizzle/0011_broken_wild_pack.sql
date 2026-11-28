ALTER TABLE "assessments" ADD COLUMN "tentative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- M2: titles that carried "(dự kiến)" become a flag; the screen still shows "(dự kiến)" next to them.
UPDATE "assessments" SET "tentative" = true, "title" = btrim(regexp_replace("title", '\s*\(dự kiến\)\s*', ' ', 'gi')) WHERE "title" ~* '\(dự kiến\)';
