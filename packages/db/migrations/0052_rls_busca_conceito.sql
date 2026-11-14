-- Trechos com vetores (ADR 0014): só do dono, e o material e a versão precisam ser dele.
ALTER TABLE material_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE material_chunks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY material_chunks_own ON material_chunks FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.owner_id = (SELECT app_user_id()))
    AND EXISTS (SELECT 1 FROM material_versions v WHERE v.id = version_id AND v.material_id = material_chunks.material_id AND v.owner_id = (SELECT app_user_id()))
  );
