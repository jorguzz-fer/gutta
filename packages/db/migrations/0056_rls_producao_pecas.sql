-- Mídia e versões das peças (ADR 0021): só admin, como o resto da produção de aulas.
ALTER TABLE production_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE production_assets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY production_assets_admin ON production_assets FOR ALL
  USING ((SELECT app_has_role('admin')))
  WITH CHECK ((SELECT app_has_role('admin')));
