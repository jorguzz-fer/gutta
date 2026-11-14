-- Cronograma e avaliações (SPEC v2, 8.2 e 8.6): só do dono, sempre ligados a uma disciplina
-- do próprio aluno. Sem literal do enum consent_purpose aqui: 'ai_materials' foi criado na
-- mesma execução.

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lessons FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lessons_own ON lessons FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY assessments_own ON assessments FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint

ALTER TABLE schedule_imports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_imports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY schedule_imports_own ON schedule_imports FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
    AND EXISTS (SELECT 1 FROM files f WHERE f.id = file_id AND f.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

-- Uso de IA: o aluno grava o próprio uso e lê só o dele; o admin lê tudo (custo). Ninguém
-- altera nem apaga pelo app: é a base das cotas e da conta de custo.
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_usage_own_insert ON ai_usage FOR INSERT
  WITH CHECK (owner_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY ai_usage_own_read ON ai_usage FOR SELECT
  USING (owner_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY ai_usage_admin_read ON ai_usage FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint
REVOKE UPDATE, DELETE ON ai_usage FROM gutta_app;
--> statement-breakpoint

-- Migração do MVP (plano, item 41): as provas cadastradas no onboarding antigo (exam_dates)
-- viram avaliações na disciplina correspondente do aluno (a criada no item 38). Rodar de
-- novo não duplica.
INSERT INTO assessments (owner_id, discipline_id, kind, name, due_at, origin)
SELECT e.student_id, d.id, 'prova', e.title, e.exam_at, 'manual'
FROM exam_dates e
JOIN enrolled_disciplines d
  ON d.owner_id = e.student_id AND d.catalog_discipline_id = e.discipline_id AND d.archived_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM assessments a
  WHERE a.owner_id = e.student_id AND a.discipline_id = d.id AND a.name = e.title AND a.due_at = e.exam_at
);
