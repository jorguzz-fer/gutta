-- Revisão das peças (ADR 0021, Fase 4): o revisor lê a produção para revisar, registra a
-- decisão e pede ajuste (a tarefa volta para a geração). Admin continua com tudo.
ALTER TABLE production_reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE production_reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY production_reviews_read ON production_reviews FOR SELECT
  USING ((SELECT app_has_role('admin')) OR (SELECT app_has_role('reviewer')));
--> statement-breakpoint
-- Só o próprio revisor assina a decisão.
CREATE POLICY production_reviews_insert ON production_reviews FOR INSERT
  WITH CHECK (
    ((SELECT app_has_role('admin')) OR (SELECT app_has_role('reviewer')))
    AND reviewer_id = (SELECT app_user_id())
  );
--> statement-breakpoint
-- Registro de decisão não muda nem some (só junto com o lote).
REVOKE UPDATE ON production_reviews FROM gutta_app;
--> statement-breakpoint
CREATE POLICY production_batches_reviewer_read ON production_batches FOR SELECT
  USING ((SELECT app_has_role('reviewer')));
--> statement-breakpoint
CREATE POLICY production_slides_reviewer_read ON production_slides FOR SELECT
  USING ((SELECT app_has_role('reviewer')));
--> statement-breakpoint
CREATE POLICY production_assets_reviewer_read ON production_assets FOR SELECT
  USING ((SELECT app_has_role('reviewer')));
--> statement-breakpoint
CREATE POLICY production_tasks_reviewer_read ON production_tasks FOR SELECT
  USING ((SELECT app_has_role('reviewer')));
--> statement-breakpoint
-- Pedir ajuste ou aprovar muda a tarefa (nota, geração, versão aprovada).
CREATE POLICY production_tasks_reviewer_update ON production_tasks FOR UPDATE
  USING ((SELECT app_has_role('reviewer')))
  WITH CHECK ((SELECT app_has_role('reviewer')));
--> statement-breakpoint
CREATE POLICY production_batches_reviewer_update ON production_batches FOR UPDATE
  USING ((SELECT app_has_role('reviewer')))
  WITH CHECK ((SELECT app_has_role('reviewer')));
--> statement-breakpoint
-- Ajuste num vídeo: a mídia anterior é marcada como substituída.
CREATE POLICY production_assets_reviewer_update ON production_assets FOR UPDATE
  USING ((SELECT app_has_role('reviewer')))
  WITH CHECK ((SELECT app_has_role('reviewer')));
