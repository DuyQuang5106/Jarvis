CREATE TABLE "daily_briefs" (
	"day" date PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_briefs" ENABLE ROW LEVEL SECURITY;