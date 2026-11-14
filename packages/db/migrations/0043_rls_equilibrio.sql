-- Equilíbrio (SPEC v2, 5.4 e 8.3): tarefas, propostas e sessões só do dono. Cada referência a
-- disciplina, tema, aula, avaliação, proposta ou tarefa precisa ser do próprio aluno.

ALTER TABLE study_tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE study_tasks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY study_tasks_own ON study_tasks FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (discipline_id IS NULL OR EXISTS (
      SELECT 1 FROM enrolled_disciplines d WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())))
    AND (topic_id IS NULL OR EXISTS (
      SELECT 1 FROM discipline_topics x WHERE x.id = topic_id AND x.owner_id = (SELECT app_user_id())))
    AND (lesson_id IS NULL OR EXISTS (
      SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id())))
    AND (assessment_id IS NULL OR EXISTS (
      SELECT 1 FROM assessments a WHERE a.id = assessment_id AND a.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

ALTER TABLE plan_proposals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE plan_proposals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plan_proposals_own ON plan_proposals FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (owner_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE study_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY study_sessions_own ON study_sessions FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (proposal_id IS NULL OR EXISTS (
      SELECT 1 FROM plan_proposals p WHERE p.id = proposal_id AND p.owner_id = (SELECT app_user_id())))
    AND (task_id IS NULL OR EXISTS (
      SELECT 1 FROM study_tasks t WHERE t.id = task_id AND t.owner_id = (SELECT app_user_id())))
    AND (discipline_id IS NULL OR EXISTS (
      SELECT 1 FROM enrolled_disciplines d WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())))
  );
