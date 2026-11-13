-- Compromissos do calendário (SPEC v2, CAL; 8.2): só do dono. Disciplina, quando houver, é do
-- próprio aluno; exceção só aponta para evento do próprio aluno.

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_events_own ON calendar_events FOR ALL
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

ALTER TABLE calendar_event_exceptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_event_exceptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_event_exceptions_own ON calendar_event_exceptions FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM calendar_events e WHERE e.id = event_id AND e.owner_id = (SELECT app_user_id())
    )
  );
