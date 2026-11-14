CREATE TYPE "public"."routine_block_kind" AS ENUM('aula', 'estudo', 'pessoal');--> statement-breakpoint
CREATE TABLE "planning_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"weekly_goal_minutes" integer DEFAULT 1200 NOT NULL,
	"grid_step_minutes" smallint DEFAULT 60 NOT NULL,
	"view_start_minute" smallint DEFAULT 480 NOT NULL,
	"view_end_minute" smallint DEFAULT 1440 NOT NULL,
	"routine_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_goal_ck" CHECK ("planning_preferences"."weekly_goal_minutes" between 0 and 6000),
	CONSTRAINT "planning_step_ck" CHECK ("planning_preferences"."grid_step_minutes" in (15, 30, 60)),
	CONSTRAINT "planning_view_ck" CHECK ("planning_preferences"."view_start_minute" between 0 and 1380 and "planning_preferences"."view_end_minute" between 60 and 1440 and "planning_preferences"."view_end_minute" > "planning_preferences"."view_start_minute")
);
--> statement-breakpoint
CREATE TABLE "routine_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "routine_block_kind" NOT NULL,
	"category" text,
	"label" text NOT NULL,
	"discipline_id" uuid,
	"color" smallint,
	"weekdays" smallint[] NOT NULL,
	"start_minute" smallint NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_blocks_start_ck" CHECK ("routine_blocks"."start_minute" between 0 and 1439),
	CONSTRAINT "routine_blocks_duration_ck" CHECK ("routine_blocks"."duration_minutes" between 5 and 1440),
	CONSTRAINT "routine_blocks_weekdays_ck" CHECK (cardinality("routine_blocks"."weekdays") between 1 and 7 and "routine_blocks"."weekdays" <@ array[0,1,2,3,4,5,6]::smallint[]),
	CONSTRAINT "routine_blocks_color_ck" CHECK ("routine_blocks"."color" is null or "routine_blocks"."color" between 1 and 8),
	CONSTRAINT "routine_blocks_aula_ck" CHECK (("routine_blocks"."kind" = 'aula') = ("routine_blocks"."discipline_id" is not null)),
	CONSTRAINT "routine_blocks_valid_ck" CHECK ("routine_blocks"."valid_until" is null or "routine_blocks"."valid_until" >= "routine_blocks"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "planning_preferences" ADD CONSTRAINT "planning_preferences_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_blocks" ADD CONSTRAINT "routine_blocks_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_blocks" ADD CONSTRAINT "routine_blocks_discipline_id_enrolled_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."enrolled_disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "routine_blocks_owner_idx" ON "routine_blocks" USING btree ("owner_id");