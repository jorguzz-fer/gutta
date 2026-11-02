-- Banco de questões: workflow editorial, integridade das tentativas e RLS.

-- Novas tabelas herdam os privilégios padrão; reforçamos o que é só de inserção.
REVOKE UPDATE, DELETE ON question_attempts FROM gutta_app;
--> statement-breakpoint

-- root_id aponta para a primeira versão da questão.
CREATE OR REPLACE FUNCTION questions_set_root() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.root_id IS NULL THEN
    NEW.root_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER questions_root BEFORE INSERT ON questions
  FOR EACH ROW EXECUTE FUNCTION questions_set_root();
--> statement-breakpoint
CREATE TRIGGER questions_editorial_transition
  BEFORE INSERT OR UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION enforce_editorial_transition();
--> statement-breakpoint

-- Alternativas e fontes de questão aprovada, publicada ou arquivada só mudam por revisor.
CREATE OR REPLACE FUNCTION guard_question_children() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  qid uuid := COALESCE(NEW.question_id, OLD.question_id);
  st content_status;
BEGIN
  IF current_user <> 'gutta_app' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT status INTO st FROM questions WHERE id = qid;
  IF st IN ('approved', 'published', 'archived')
     AND NOT (app_has_role('reviewer') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'questão % está %, edite criando uma nova versão', qid, st
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_options_guard BEFORE INSERT OR UPDATE OR DELETE ON question_options
  FOR EACH ROW EXECUTE FUNCTION guard_question_children();
--> statement-breakpoint
CREATE TRIGGER question_sources_guard BEFORE INSERT OR UPDATE OR DELETE ON question_sources
  FOR EACH ROW EXECUTE FUNCTION guard_question_children();
--> statement-breakpoint

-- A correção é do banco: is_correct vem da alternativa, que precisa ser da questão,
-- e a questão precisa estar publicada. O cliente nunca define o resultado.
CREATE OR REPLACE FUNCTION grade_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  correct boolean;
  st content_status;
BEGIN
  SELECT o.is_correct, q.status INTO correct, st
  FROM question_options o JOIN questions q ON q.id = o.question_id
  WHERE o.id = NEW.selected_option_id AND o.question_id = NEW.question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'alternativa não pertence à questão' USING ERRCODE = 'check_violation';
  END IF;
  IF st <> 'published' THEN
    RAISE EXCEPTION 'questão não publicada' USING ERRCODE = 'check_violation';
  END IF;
  NEW.is_correct := correct;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_attempts_grade BEFORE INSERT ON question_attempts
  FOR EACH ROW EXECUTE FUNCTION grade_attempt();
--> statement-breakpoint

-- ── RLS: conteúdo editorial ───────────────────────────────────────────────
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE questions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY questions_read ON questions FOR SELECT
  USING (status = 'published' OR (SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY questions_editorial_insert ON questions FOR INSERT
  WITH CHECK ((SELECT app_is_editorial()) AND author_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY questions_editorial_update ON questions FOR UPDATE
  USING ((SELECT app_is_editorial()))
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY questions_admin_delete ON questions FOR DELETE
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE question_options FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A subconsulta em questions passa pelo RLS dela: alternativa de rascunho fica invisível ao aluno.
CREATE POLICY question_options_read ON question_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM questions q WHERE q.id = question_id));
--> statement-breakpoint
CREATE POLICY question_options_editorial_write ON question_options FOR ALL
  USING ((SELECT app_is_editorial()))
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint

ALTER TABLE question_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE question_sources FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY question_sources_read ON question_sources FOR SELECT
  USING (EXISTS (SELECT 1 FROM questions q WHERE q.id = question_id));
--> statement-breakpoint
CREATE POLICY question_sources_editorial_write ON question_sources FOR ALL
  USING ((SELECT app_is_editorial()))
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint

-- ── RLS: estudo do aluno ──────────────────────────────────────────────────
ALTER TABLE question_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE question_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY question_sessions_own ON question_sessions FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (student_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY question_sessions_admin_read ON question_sessions FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE question_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY question_attempts_own_read ON question_attempts FOR SELECT
  USING (student_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY question_attempts_own_insert ON question_attempts FOR INSERT
  WITH CHECK (
    student_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM question_sessions s WHERE s.id = session_id AND s.student_id = (SELECT app_user_id()))
  );
--> statement-breakpoint
-- Métricas agregadas (admin) e estatística por questão (editorial) leem tentativas de todos.
CREATE POLICY question_attempts_staff_read ON question_attempts FOR SELECT
  USING ((SELECT app_has_role('admin')) OR (SELECT app_has_role('reviewer')));
--> statement-breakpoint

ALTER TABLE topic_mastery ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE topic_mastery FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY topic_mastery_own ON topic_mastery FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (student_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE learning_recommendations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learning_recommendations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY learning_recommendations_own ON learning_recommendations FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (student_id = (SELECT app_user_id()));
