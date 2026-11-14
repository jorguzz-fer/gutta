-- Tutor sobre os materiais (SPEC v2, AJU-08): conversas e mensagens só do dono. Disciplina e
-- aula precisam ser do próprio aluno; materiais são conferidos no serviço, a cada pergunta.

ALTER TABLE tutor_threads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tutor_threads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tutor_threads_own ON tutor_threads FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (discipline_id IS NULL OR EXISTS (
      SELECT 1 FROM enrolled_disciplines d WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())))
    AND (lesson_id IS NULL OR EXISTS (
      SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

ALTER TABLE tutor_thread_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tutor_thread_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tutor_thread_messages_own ON tutor_thread_messages FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM tutor_threads t WHERE t.id = thread_id AND t.owner_id = (SELECT app_user_id()))
  );
