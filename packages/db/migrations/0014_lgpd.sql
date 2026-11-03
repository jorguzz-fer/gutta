ALTER TYPE "public"."consent_purpose" ADD VALUE 'ai_tutor';--> statement-breakpoint
ALTER TABLE "data_requests" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "data_requests" ADD COLUMN "response" text;--> statement-breakpoint
ALTER TABLE "data_requests" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD COLUMN "redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_resolved_by_auth_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;