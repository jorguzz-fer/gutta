-- Acompanhar Aula (SPEC v2, 5.7; ADR 0015): tudo só do dono (AUL-28). Cada referência a
-- material, versão, aula, disciplina, tema ou nota precisa ser do próprio aluno.

ALTER TABLE slide_annotations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE slide_annotations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY slide_annotations_own ON slide_annotations FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM material_versions v
      WHERE v.id = version_id AND v.material_id = slide_annotations.material_id
        AND v.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

ALTER TABLE slide_annotation_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE slide_annotation_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY slide_annotation_history_own ON slide_annotation_history FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM slide_annotations a WHERE a.id = annotation_id AND a.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

ALTER TABLE notebook_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notebook_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notebook_entries_own ON notebook_entries FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM enrolled_disciplines d WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id()))
    AND (lesson_id IS NULL OR EXISTS (
      SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id())))
    AND (material_id IS NULL OR EXISTS (
      SELECT 1 FROM materials m WHERE m.id = material_id AND m.owner_id = (SELECT app_user_id())))
    AND (version_id IS NULL OR EXISTS (
      SELECT 1 FROM material_versions v WHERE v.id = version_id AND v.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

ALTER TABLE notebook_entry_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notebook_entry_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notebook_entry_history_own ON notebook_entry_history FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM notebook_entries e WHERE e.id = entry_id AND e.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

ALTER TABLE content_marks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE content_marks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY content_marks_own ON content_marks FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (lesson_id IS NULL OR EXISTS (
      SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id())))
    AND (material_id IS NULL OR EXISTS (
      SELECT 1 FROM materials m WHERE m.id = material_id AND m.owner_id = (SELECT app_user_id())))
    AND (version_id IS NULL OR EXISTS (
      SELECT 1 FROM material_versions v WHERE v.id = version_id AND v.owner_id = (SELECT app_user_id())))
    AND (entry_id IS NULL OR EXISTS (
      SELECT 1 FROM notebook_entries e WHERE e.id = entry_id AND e.owner_id = (SELECT app_user_id())))
    AND (topic_id IS NULL OR EXISTS (
      SELECT 1 FROM discipline_topics x WHERE x.id = topic_id AND x.owner_id = (SELECT app_user_id())))
  );
--> statement-breakpoint

ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lesson_progress FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lesson_progress_own ON lesson_progress FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id()))
    AND (last_material_id IS NULL OR EXISTS (
      SELECT 1 FROM materials m WHERE m.id = last_material_id AND m.owner_id = (SELECT app_user_id())))
  );
