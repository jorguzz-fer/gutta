CREATE TYPE "public"."calendar_event_kind" AS ENUM('compromisso', 'estudo', 'revisao', 'lazer', 'descanso', 'outro');--> statement-breakpoint
CREATE TABLE "calendar_event_exceptions" (
	"event_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"occurrence_date" date NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"change" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_exceptions_event_id_occurrence_date_pk" PRIMARY KEY("event_id","occurrence_date")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid,
	"kind" "calendar_event_kind" DEFAULT 'compromisso' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"color" smallint,
	"start_date" date NOT NULL,
	"start_minute" smallint,
	"duration_minutes" smallint DEFAULT 60 NOT NULL,
	"recurrence" jsonb,
	"blocks_time" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_start_ck" CHECK ("calendar_events"."start_minute" is null or "calendar_events"."start_minute" between 0 and 1439),
	CONSTRAINT "calendar_events_duration_ck" CHECK ("calendar_events"."duration_minutes" between 5 and 1440),
	CONSTRAINT "calendar_events_color_ck" CHECK ("calendar_events"."color" is null or "calendar_events"."color" between 1 and 8)
);
--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_owner_idx" ON "calendar_events" USING btree ("owner_id","start_date");