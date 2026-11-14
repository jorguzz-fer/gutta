-- Material de estudo (SPEC v2, 5.10): só do dono (MAT-17). Versão só aponta para arquivo do
-- próprio aluno; vínculo só para disciplina, aula, tema e docente do próprio aluno.

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE materials FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY materials_own ON materials FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (
      term_id IS NULL
      OR EXISTS (SELECT 1 FROM student_terms t WHERE t.id = term_id AND t.owner_id = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint

ALTER TABLE material_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE material_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY material_versions_own ON material_versions FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.owner_id = (SELECT app_user_id()))
    AND EXISTS (SELECT 1 FROM files f WHERE f.id = file_id AND f.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

ALTER TABLE material_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE material_links FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY material_links_own ON material_links FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.owner_id = (SELECT app_user_id()))
    AND (discipline_id IS NULL OR EXISTS (
      SELECT 1 FROM enrolled_disciplines d WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())))
    AND (lesson_id IS NULL OR EXISTS (
      SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id())))
    AND (topic_id IS NULL OR EXISTS (
      SELECT 1 FROM discipline_topics x WHERE x.id = topic_id AND x.owner_id = (SELECT app_user_id())))
    AND (teacher_id IS NULL OR EXISTS (
      SELECT 1 FROM discipline_teachers x WHERE x.id = teacher_id AND x.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

-- Lixeira (MAT-21): o worker apaga o que está na lixeira há mais de p_days dias. Sem usuário
-- no contexto, como o resto das funções de sistema.
CREATE OR REPLACE FUNCTION materials_purge(p_days int) RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int;
BEGIN
  PERFORM app_assert_system();
  DELETE FROM materials
  WHERE deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => greatest(p_days, 1));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION materials_purge(int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION materials_purge(int) TO gutta_app;
