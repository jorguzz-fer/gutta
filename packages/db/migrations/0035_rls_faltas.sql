-- Faltas (SPEC v2, 5.12): só do dono, sempre em disciplina (e aula) do próprio aluno.

ALTER TABLE attendance_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance_rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY attendance_rules_own ON attendance_rules FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE absences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY absences_own ON absences FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
    AND (
      lesson_id IS NULL
      OR EXISTS (
        SELECT 1 FROM lessons l
        WHERE l.id = lesson_id AND l.owner_id = (SELECT app_user_id())
          AND l.discipline_id = absences.discipline_id
      )
    )
  );
