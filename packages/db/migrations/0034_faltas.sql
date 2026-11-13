CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"lesson_id" uuid,
	"date" date NOT NULL,
	"class_hours" numeric(4, 1) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absences_hours_ck" CHECK ("absences"."class_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"total_class_hours" numeric(6, 1) NOT NULL,
	"min_attendance_pct" numeric(5, 2) NOT NULL,
	"class_hours_per_meeting" numeric(4, 1) DEFAULT '2' NOT NULL,
	"weekdays" smallint[],
	"alert_thresholds" smallint[] DEFAULT '{50,75,90}'::smallint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_total_ck" CHECK ("attendance_rules"."total_class_hours" > 0),
	CONSTRAINT "attendance_min_ck" CHECK ("attendance_rules"."min_attendance_pct" between 0 and 100),
	CONSTRAINT "attendance_meeting_ck" CHECK ("attendance_rules"."class_hours_per_meeting" > 0)
);
--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_rules" ADD CONSTRAINT "attendance_rules_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_rules" ADD CONSTRAINT "attendance_rules_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absences_discipline_idx" ON "absences" USING btree ("discipline_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "absences_one_per_lesson_uq" ON "absences" USING btree ("discipline_id","lesson_id") WHERE "absences"."lesson_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "absences_one_per_day_uq" ON "absences" USING btree ("discipline_id","date") WHERE "absences"."lesson_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_rules_discipline_uq" ON "attendance_rules" USING btree ("discipline_id");