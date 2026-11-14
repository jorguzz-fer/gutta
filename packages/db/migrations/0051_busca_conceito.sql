-- Busca por conceito (ADR 0014). A extensão é criada por superusuário (docs/deploy.md);
-- aqui só confere que existe.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "material_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"material_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"page_from" integer NOT NULL,
	"page_to" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "material_chunks_version_pos_uq" ON "material_chunks" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "material_chunks_owner_idx" ON "material_chunks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "material_chunks_embedding_idx" ON "material_chunks" USING hnsw ("embedding" vector_cosine_ops);