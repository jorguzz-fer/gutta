CREATE TABLE "discipline_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discipline_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" smallint DEFAULT 0 NOT NULL,
	"catalog_topic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrolled_disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"term_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"color" smallint DEFAULT 6 NOT NULL,
	"icon" text,
	"catalog_discipline_id" uuid,
	"workload_hours" smallint,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolled_disciplines_color_ck" CHECK ("enrolled_disciplines"."color" between 1 and 8),
	CONSTRAINT "enrolled_disciplines_workload_ck" CHECK ("enrolled_disciplines"."workload_hours" is null or "enrolled_disciplines"."workload_hours" between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "student_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"label" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_terms_dates_ck" CHECK ("student_terms"."starts_on" is null or "student_terms"."ends_on" is null or "student_terms"."starts_on" <= "student_terms"."ends_on")
);
--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_teachers" ADD CONSTRAINT "discipline_teachers_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_topics" ADD CONSTRAINT "discipline_topics_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_topics" ADD CONSTRAINT "discipline_topics_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline_topics" ADD CONSTRAINT "discipline_topics_catalog_topic_id_topics_id_fk" FOREIGN KEY ("catalog_topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolled_disciplines" ADD CONSTRAINT "enrolled_disciplines_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolled_disciplines" ADD CONSTRAINT "enrolled_disciplines_term_id_student_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."student_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolled_disciplines" ADD CONSTRAINT "enrolled_disciplines_catalog_discipline_id_disciplines_id_fk" FOREIGN KEY ("catalog_discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_terms" ADD CONSTRAINT "student_terms_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_teachers_name_uq" ON "discipline_teachers" USING btree ("discipline_id",lower("name"));--> statement-breakpoint
CREATE INDEX "discipline_teachers_owner_idx" ON "discipline_teachers" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_topics_name_uq" ON "discipline_topics" USING btree ("discipline_id",lower("name"));--> statement-breakpoint
CREATE INDEX "discipline_topics_owner_idx" ON "discipline_topics" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "enrolled_disciplines_owner_idx" ON "enrolled_disciplines" USING btree ("owner_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolled_disciplines_name_uq" ON "enrolled_disciplines" USING btree ("term_id",lower("name")) WHERE "enrolled_disciplines"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "student_terms_owner_idx" ON "student_terms" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_terms_current_uq" ON "student_terms" USING btree ("owner_id") WHERE "student_terms"."is_current";