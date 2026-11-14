-- Ajuda Cognuss (SPEC v2, 5.14 e 8.7; ADR 0020): trabalhos, criações, fontes, questões e
-- tentativas só do dono (AUL-28, IA-7). Cada referência precisa ser do próprio aluno.

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_jobs_own ON ai_jobs FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (owner_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE creations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE creations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY creations_own ON creations FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (job_id IS NULL OR EXISTS (
      SELECT 1 FROM ai_jobs j WHERE j.id = job_id AND j.owner_id = (SELECT app_user_id())))
    AND (discipline_id IS NULL OR EXISTS (
      SELECT 1 FROM enrolled_disciplines d WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())))
    AND (topic_id IS NULL OR EXISTS (
      SELECT 1 FROM discipline_topics x WHERE x.id = topic_id AND x.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

ALTER TABLE creation_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE creation_sources FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY creation_sources_own ON creation_sources FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM creations c WHERE c.id = creation_id AND c.owner_id = (SELECT app_user_id()))
    AND (material_id IS NULL OR EXISTS (
      SELECT 1 FROM materials m WHERE m.id = material_id AND m.owner_id = (SELECT app_user_id())))
    AND (version_id IS NULL OR EXISTS (
      SELECT 1 FROM material_versions v WHERE v.id = version_id AND v.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

ALTER TABLE creation_questions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE creation_questions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY creation_questions_own ON creation_questions FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM creations c WHERE c.id = creation_id AND c.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

ALTER TABLE creation_question_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE creation_question_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY creation_question_attempts_own ON creation_question_attempts FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM creation_questions q WHERE q.id = question_id AND q.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

-- Flashcards pessoais gerados (MEM-01): ligação à criação e à disciplina do próprio aluno.
ALTER TABLE flashcards ADD CONSTRAINT flashcards_creation_fk
  FOREIGN KEY (creation_id) REFERENCES creations(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE flashcards ADD CONSTRAINT flashcards_enrolled_discipline_fk
  FOREIGN KEY (enrolled_discipline_id) REFERENCES enrolled_disciplines(id) ON DELETE SET NULL;
--> statement-breakpoint
DROP POLICY flashcards_own_write ON flashcards;
--> statement-breakpoint
CREATE POLICY flashcards_own_write ON flashcards FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND visibility = 'private'
    AND (creation_id IS NULL OR EXISTS (
      SELECT 1 FROM creations c WHERE c.id = creation_id AND c.owner_id = (SELECT app_user_id())))
    AND (enrolled_discipline_id IS NULL OR EXISTS (
      SELECT 1 FROM enrolled_disciplines d WHERE d.id = enrolled_discipline_id AND d.owner_id = (SELECT app_user_id())))
  );
