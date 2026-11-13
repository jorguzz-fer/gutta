CREATE TYPE "public"."grading_method" AS ENUM('simples', 'pesos', 'percentual');--> statement-breakpoint
CREATE TABLE "grading_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"discipline_id" uuid NOT NULL,
	"method" "grading_method" DEFAULT 'pesos' NOT NULL,
	"min_grade" numeric(4, 2) DEFAULT '7' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grading_min_ck" CHECK ("grading_schemes"."min_grade" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grading_schemes_discipline_uq" ON "grading_schemes" USING btree ("discipline_id");