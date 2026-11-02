-- Direito de acesso (LGPD): o aluno lê os próprios eventos de produto na exportação de dados.
CREATE POLICY product_events_own_read ON product_events FOR SELECT
  USING (actor_id = (SELECT app_user_id()));
