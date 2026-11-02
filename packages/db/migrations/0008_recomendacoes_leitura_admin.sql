-- Métricas agregadas: admin lê as recomendações mostradas (motivo e versão do algoritmo).
CREATE POLICY learning_recommendations_admin_read ON learning_recommendations FOR SELECT
  USING ((SELECT app_has_role('admin')));
