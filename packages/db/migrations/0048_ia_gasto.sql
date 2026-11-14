CREATE TABLE "ai_spend_alerts" (
	"period" text PRIMARY KEY NOT NULL,
	"total_micros" bigint NOT NULL,
	"threshold_micros" bigint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
