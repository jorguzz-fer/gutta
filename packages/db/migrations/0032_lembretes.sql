CREATE TYPE "public"."delivery_status" AS ENUM('sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reminder_mode" AS ENUM('lembrar', 'reservar');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" "delivery_status" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"quiet_from" smallint,
	"quiet_until" smallint,
	"daily_cap" smallint DEFAULT 10 NOT NULL,
	"academic_alerts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_quiet_ck" CHECK (("notification_preferences"."quiet_from" is null) = ("notification_preferences"."quiet_until" is null) and ("notification_preferences"."quiet_from" is null or ("notification_preferences"."quiet_from" between 0 and 1439 and "notification_preferences"."quiet_until" between 0 and 1439))),
	CONSTRAINT "notification_cap_ck" CHECK ("notification_preferences"."daily_cap" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"email_handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'tarefa' NOT NULL,
	"discipline_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"mode" "reminder_mode" DEFAULT 'lembrar' NOT NULL,
	"duration_minutes" smallint,
	"calendar_event_id" uuid,
	"lead_minutes" integer DEFAULT 30,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_lead_ck" CHECK ("reminders"."lead_minutes" is null or "reminders"."lead_minutes" between 0 and 20160),
	CONSTRAINT "reminders_duration_ck" CHECK ("reminders"."duration_minutes" is null or "reminders"."duration_minutes" between 5 and 1440)
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_owner_idx" ON "notification_deliveries" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_owner_dedupe_uq" ON "notifications" USING btree ("owner_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_owner_scheduled_idx" ON "notifications" USING btree ("owner_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_email_pending_idx" ON "notifications" USING btree ("scheduled_for") WHERE "notifications"."email_handled_at" is null;--> statement-breakpoint
CREATE INDEX "reminders_owner_due_idx" ON "reminders" USING btree ("owner_id","due_at");