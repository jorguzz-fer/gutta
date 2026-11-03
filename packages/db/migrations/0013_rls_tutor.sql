-- Tutor IA: o aluno lê e escreve só as próprias conversas; admin lê tudo (revisão e custo).
-- Configurações: todos leem (o app precisa saber se o tutor está ligado); só admin altera.

ALTER TABLE tutor_conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tutor_conversations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tutor_conversations_own ON tutor_conversations FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (student_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY tutor_conversations_admin_read ON tutor_conversations FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE tutor_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tutor_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tutor_messages_own_read ON tutor_messages FOR SELECT
  USING (student_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY tutor_messages_own_insert ON tutor_messages FOR INSERT
  WITH CHECK (
    student_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM tutor_conversations c
      WHERE c.id = conversation_id AND c.student_id = (SELECT app_user_id())
    )
  );
--> statement-breakpoint
CREATE POLICY tutor_messages_admin_read ON tutor_messages FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint
-- Mensagens não mudam depois de gravadas (registro de uso e custo).
REVOKE UPDATE, DELETE ON tutor_messages FROM gutta_app;
--> statement-breakpoint

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_settings_read ON app_settings FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY app_settings_admin_write ON app_settings FOR ALL
  USING ((SELECT app_has_role('admin')))
  WITH CHECK ((SELECT app_has_role('admin')));
