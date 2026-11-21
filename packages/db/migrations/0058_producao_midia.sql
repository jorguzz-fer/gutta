ALTER TABLE "production_tasks" ADD COLUMN "media_stage" text;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "storyboard" jsonb;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "media_alert" text;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "media_resume" text;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD COLUMN "media_lease_until" timestamp with time zone;