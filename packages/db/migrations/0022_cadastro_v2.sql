CREATE TYPE "public"."main_goal" AS ENUM('reforcar_disciplinas', 'preparar_provas', 'organizar_rotina', 'desenvolver_curriculo');--> statement-breakpoint
CREATE TABLE "personal_data" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"cpf_encrypted" text NOT NULL,
	"cpf_hash" text NOT NULL,
	"cpf_last2" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_data_last2_ck" CHECK ("personal_data"."cpf_last2" ~ '^[0-9]{2}$'),
	CONSTRAINT "personal_data_phone_ck" CHECK ("personal_data"."phone" ~ '^\+[0-9]{8,15}$')
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "course_other" text;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "campus" text;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "class_group" text;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "main_goal" "main_goal";--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "signup_step" text;--> statement-breakpoint
ALTER TABLE "personal_data" ADD CONSTRAINT "personal_data_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_data_cpf_hash_uq" ON "personal_data" USING btree ("cpf_hash");