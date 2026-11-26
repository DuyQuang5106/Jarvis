CREATE TABLE "checkins" (
	"day" date NOT NULL,
	"slot" text NOT NULL,
	"status" text NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_day_slot_pk" PRIMARY KEY("day","slot")
);
--> statement-breakpoint
ALTER TABLE "checkins" ENABLE ROW LEVEL SECURITY;