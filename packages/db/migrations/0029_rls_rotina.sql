-- Rotina semanal e preferências de planejamento (SPEC v2, 5.3 e 8.3): só do dono. Aula
-- montada à mão só aponta para disciplina do próprio aluno.

ALTER TABLE routine_blocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE routine_blocks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY routine_blocks_own ON routine_blocks FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND (
      discipline_id IS NULL
      OR EXISTS (
        SELECT 1 FROM enrolled_disciplines d
        WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
      )
    )
  );
--> statement-breakpoint

ALTER TABLE planning_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE planning_preferences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY planning_preferences_own ON planning_preferences FOR ALL
  USING (user_id = (SELECT app_user_id()))
  WITH CHECK (user_id = (SELECT app_user_id()));
