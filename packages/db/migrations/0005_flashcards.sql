CREATE TYPE "public"."flashcard_visibility" AS ENUM('private', 'editorial');--> statement-breakpoint
CREATE TABLE "flashcard_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"flashcard_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"prev_interval_days" integer NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"client_review_key" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_reviews_rating_chk" CHECK ("flashcard_reviews"."rating" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "flashcard_schedules" (
	"student_id" text NOT NULL,
	"flashcard_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"algorithm_version" text NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_schedules_student_id_flashcard_id_pk" PRIMARY KEY("student_id","flashcard_id")
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"topic_id" uuid,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"source_question_id" uuid,
	"visibility" "flashcard_visibility" DEFAULT 'private' NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"author_id" text,
	"reviewer_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcards_visibility_chk" CHECK (("flashcards"."visibility" = 'private' and "flashcards"."owner_id" is not null) or ("flashcards"."visibility" = 'editorial' and "flashcards"."owner_id" is null))
);
--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_student_id_auth_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_schedules" ADD CONSTRAINT "flashcard_schedules_student_id_auth_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_schedules" ADD CONSTRAINT "flashcard_schedules_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_source_question_id_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_reviewer_id_auth_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_reviews_idem_uq" ON "flashcard_reviews" USING btree ("student_id","client_review_key");--> statement-breakpoint
CREATE INDEX "flashcard_reviews_student_idx" ON "flashcard_reviews" USING btree ("student_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "flashcard_schedules_due_idx" ON "flashcard_schedules" USING btree ("student_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flashcards_owner_question_uq" ON "flashcards" USING btree ("owner_id","source_question_id");--> statement-breakpoint
CREATE INDEX "flashcards_topic_idx" ON "flashcards" USING btree ("topic_id","status");--> statement-breakpoint
CREATE INDEX "flashcards_owner_idx" ON "flashcards" USING btree ("owner_id");