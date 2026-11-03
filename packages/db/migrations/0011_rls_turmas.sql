-- Turmas do painel do professor. Regras:
-- 1. O professor gerencia só as turmas dele; o aluno vê só as turmas em que está.
-- 2. Entrar e sair da turma só por funções (join_class, leave_class): o aluno não escolhe
--    em qual turma escrever, nem altera a data de entrada.
-- 3. O professor nunca lê tentativas direto. As funções class_* devolvem agregados, só de
--    alunos ainda na turma e só do que fizeram DEPOIS de entrar (consentimento informado).
-- Sem literal do enum app_role aqui: o valor 'teacher' foi criado na mesma execução.

CREATE OR REPLACE FUNCTION app_is_teacher() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_assignments WHERE user_id = app_user_id() AND role::text = 'teacher'
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_teaches(p_class uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM classes WHERE id = p_class AND teacher_id = app_user_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_member_of(p_class uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_members
    WHERE class_id = p_class AND student_id = app_user_id() AND left_at IS NULL
  )
$$;
--> statement-breakpoint

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY classes_teacher_all ON classes FOR ALL
  USING (teacher_id = (SELECT app_user_id()))
  WITH CHECK (
    teacher_id = (SELECT app_user_id())
    AND ((SELECT app_is_teacher()) OR (SELECT app_has_role('admin')))
  );
--> statement-breakpoint
CREATE POLICY classes_member_read ON classes FOR SELECT
  USING ((SELECT app_member_of(id)));
--> statement-breakpoint
CREATE POLICY classes_admin_read ON classes FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY class_members_own_read ON class_members FOR SELECT
  USING (student_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY class_members_teacher_read ON class_members FOR SELECT
  USING ((SELECT app_teaches(class_id)));
--> statement-breakpoint
CREATE POLICY class_members_teacher_remove ON class_members FOR DELETE
  USING ((SELECT app_teaches(class_id)));
--> statement-breakpoint
CREATE POLICY class_members_admin_read ON class_members FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

-- Entrar pelo código. Reentrar depois de sair recomeça a contagem (nova data de entrada).
CREATE OR REPLACE FUNCTION join_class(p_code text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me text := app_user_id();
  cid uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'sem usuário no contexto' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT id INTO cid FROM classes
  WHERE join_code = upper(trim(p_code)) AND active AND teacher_id <> me;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'código de turma não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO class_members (class_id, student_id) VALUES (cid, me)
  ON CONFLICT (class_id, student_id) DO UPDATE
    SET joined_at = CASE WHEN class_members.left_at IS NULL THEN class_members.joined_at ELSE now() END,
        left_at = NULL;
  RETURN cid;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION leave_class(p_class uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE class_members SET left_at = now()
  WHERE class_id = p_class AND student_id = app_user_id() AND left_at IS NULL
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_assert_teaches(p_class uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (app_teaches(p_class) OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'turma de outro professor' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
--> statement-breakpoint

-- Por aluno: totais desde a entrada e nos últimos 7 dias, e a última atividade.
CREATE OR REPLACE FUNCTION class_student_stats(p_class uuid)
RETURNS TABLE (
  student_id text, display_name text, joined_at timestamptz,
  attempts int, correct int, attempts_7d int, correct_7d int, last_activity timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM app_assert_teaches(p_class);
  RETURN QUERY
  SELECT m.student_id, coalesce(p.display_name, 'Aluno'), m.joined_at,
         count(a.id)::int,
         (count(a.id) FILTER (WHERE a.is_correct))::int,
         (count(a.id) FILTER (WHERE a.answered_at > now() - interval '7 days'))::int,
         (count(a.id) FILTER (WHERE a.is_correct AND a.answered_at > now() - interval '7 days'))::int,
         max(a.answered_at)
  FROM class_members m
  LEFT JOIN profiles p ON p.user_id = m.student_id
  LEFT JOIN question_attempts a ON a.student_id = m.student_id AND a.answered_at >= m.joined_at
  WHERE m.class_id = p_class AND m.left_at IS NULL
  GROUP BY m.student_id, p.display_name, m.joined_at
  ORDER BY p.display_name;
END;
$$;
--> statement-breakpoint

-- Por assunto: quantos alunos praticaram e a taxa de acerto da turma.
CREATE OR REPLACE FUNCTION class_topic_stats(p_class uuid)
RETURNS TABLE (
  topic_id uuid, topic_name text, discipline_name text, students int, attempts int, correct int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM app_assert_teaches(p_class);
  RETURN QUERY
  SELECT t.id, t.name, d.name,
         count(DISTINCT a.student_id)::int, count(*)::int,
         (count(*) FILTER (WHERE a.is_correct))::int
  FROM class_members m
  JOIN question_attempts a ON a.student_id = m.student_id AND a.answered_at >= m.joined_at
  JOIN questions q ON q.id = a.question_id
  JOIN topics t ON t.id = q.topic_id
  JOIN disciplines d ON d.id = t.discipline_id
  WHERE m.class_id = p_class AND m.left_at IS NULL
  GROUP BY t.id, t.name, d.name
  ORDER BY (count(*) FILTER (WHERE a.is_correct))::numeric / count(*), count(*) DESC;
END;
$$;
--> statement-breakpoint

-- Questões que a turma mais erra, com a alternativa errada mais escolhida.
CREATE OR REPLACE FUNCTION class_missed_questions(p_class uuid, p_limit int DEFAULT 10)
RETURNS TABLE (
  question_id uuid, stem text, topic_name text, attempts int, wrong int, common_wrong text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM app_assert_teaches(p_class);
  RETURN QUERY
  WITH att AS (
    SELECT a.* FROM class_members m
    JOIN question_attempts a ON a.student_id = m.student_id AND a.answered_at >= m.joined_at
    WHERE m.class_id = p_class AND m.left_at IS NULL
  )
  SELECT q.id, q.stem, t.name, count(*)::int,
         (count(*) FILTER (WHERE NOT att.is_correct))::int,
         (SELECT o.body FROM att a2 JOIN question_options o ON o.id = a2.selected_option_id
          WHERE a2.question_id = q.id AND NOT a2.is_correct
          GROUP BY o.body ORDER BY count(*) DESC LIMIT 1)
  FROM att
  JOIN questions q ON q.id = att.question_id
  JOIN topics t ON t.id = q.topic_id
  GROUP BY q.id, q.stem, t.name
  HAVING count(*) FILTER (WHERE NOT att.is_correct) > 0
  ORDER BY (count(*) FILTER (WHERE NOT att.is_correct))::numeric / count(*) DESC, count(*) DESC
  LIMIT greatest(1, least(p_limit, 50));
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_is_teacher() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_teaches(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_member_of(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION join_class(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION leave_class(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_assert_teaches(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION class_student_stats(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION class_topic_stats(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION class_missed_questions(uuid, int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_teacher() TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_teaches(uuid) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_member_of(uuid) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION join_class(text) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION leave_class(uuid) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION class_student_stats(uuid) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION class_topic_stats(uuid) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION class_missed_questions(uuid, int) TO gutta_app;
