-- Vida acadêmica do aluno (SPEC v2, 8.1). Só o dono lê e escreve. Docentes e temas só podem
-- apontar para disciplina do próprio aluno; disciplina só para semestre do próprio aluno.

ALTER TABLE student_terms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_terms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY student_terms_own ON student_terms FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (owner_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE enrolled_disciplines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE enrolled_disciplines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY enrolled_disciplines_own ON enrolled_disciplines FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM student_terms t WHERE t.id = term_id AND t.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint

ALTER TABLE discipline_teachers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discipline_teachers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY discipline_teachers_own ON discipline_teachers FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint

ALTER TABLE discipline_topics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discipline_topics FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY discipline_topics_own ON discipline_topics FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint

-- Migração do MVP (plano, item 38): quem já tem disciplinas do catálogo ganha um semestre
-- atual e as mesmas disciplinas como disciplinas próprias, ligadas ao catálogo. As tabelas
-- antigas continuam: o painel do MVP segue lendo delas até o Meu Espaço substituí-lo.
-- Só cria para quem ainda não tem semestre, então rodar de novo não duplica nada.
INSERT INTO student_terms (owner_id, label, is_current)
SELECT DISTINCT sd.student_id, 'Semestre atual', true
FROM student_disciplines sd
WHERE sd.active_until IS NULL
  AND NOT EXISTS (SELECT 1 FROM student_terms t WHERE t.owner_id = sd.student_id);
--> statement-breakpoint
INSERT INTO enrolled_disciplines (owner_id, term_id, name, color, catalog_discipline_id)
SELECT
  sd.student_id,
  t.id,
  d.name,
  -- Cores de 1 a 8, em ordem, para as disciplinas não começarem todas iguais.
  ((row_number() OVER (PARTITION BY sd.student_id ORDER BY d.name) - 1) % 8 + 1)::smallint,
  d.id
FROM student_disciplines sd
JOIN disciplines d ON d.id = sd.discipline_id
JOIN student_terms t ON t.owner_id = sd.student_id AND t.is_current
WHERE sd.active_until IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM enrolled_disciplines e
    WHERE e.owner_id = sd.student_id AND e.catalog_discipline_id = d.id
  );
