-- Lembretes e avisos (SPEC v2, 5.11): só do dono. Entregas só se acrescentam. O worker acha
-- os avisos a enviar por e-mail com a função de sistema abaixo, sem usuário no contexto, e
-- trata cada um dentro de withUser(dono).

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reminders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reminders_own ON reminders FOR ALL
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
    AND (
      calendar_event_id IS NULL
      OR EXISTS (
        SELECT 1 FROM calendar_events e
        WHERE e.id = calendar_event_id AND e.owner_id = (SELECT app_user_id())
      )
    )
  );
--> statement-breakpoint

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_own ON notifications FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (owner_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_deliveries_own_insert ON notification_deliveries FOR INSERT
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.id = notification_id AND n.owner_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint
CREATE POLICY notification_deliveries_own_read ON notification_deliveries FOR SELECT
  USING (owner_id = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE UPDATE, DELETE ON notification_deliveries FROM gutta_app;
--> statement-breakpoint

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_preferences_own ON notification_preferences FOR ALL
  USING (user_id = (SELECT app_user_id()))
  WITH CHECK (user_id = (SELECT app_user_id()));
--> statement-breakpoint

-- Avisos vencidos, ainda não tratados por e-mail, de quem ligou o e-mail. Devolve só ids;
-- o resto o worker lê como o dono. FOR UPDATE SKIP LOCKED: duas instâncias não pegam o mesmo.
CREATE OR REPLACE FUNCTION notifications_email_due(p_limit int)
RETURNS TABLE (id uuid, owner_id text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM app_assert_system();
  RETURN QUERY
    SELECT n.id, n.owner_id
    FROM notifications n
    JOIN notification_preferences p ON p.user_id = n.owner_id AND p.email_enabled
    WHERE n.email_handled_at IS NULL AND n.scheduled_for <= now()
    ORDER BY n.scheduled_for
    LIMIT greatest(1, least(p_limit, 200))
    FOR UPDATE OF n SKIP LOCKED;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION notifications_email_due(int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION notifications_email_due(int) TO gutta_app;
