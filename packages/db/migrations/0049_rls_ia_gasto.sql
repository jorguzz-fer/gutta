-- Alerta de gasto com IA (SPEC v2, 7.7). O admin lê; só o worker grava, pela função abaixo.

ALTER TABLE ai_spend_alerts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_spend_alerts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_spend_alerts_admin_read ON ai_spend_alerts FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON ai_spend_alerts FROM gutta_app;
--> statement-breakpoint

-- Gasto do mês (fuso de São Paulo) em micro-dólares: criações, cronograma e tutor sobre os
-- materiais (ai_usage) mais o tutor do módulo (tutor_messages).
CREATE OR REPLACE FUNCTION ai_spend_month_micros() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH since AS (
    SELECT (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS t
  )
  SELECT coalesce((SELECT sum(cost_micros) FROM ai_usage, since WHERE created_at >= since.t), 0)::bigint
       + coalesce((SELECT sum(cost_micros) FROM tutor_messages, since WHERE created_at >= since.t), 0)::bigint
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ai_spend_month_micros() FROM PUBLIC;
--> statement-breakpoint

-- Uma volta do worker: se o gasto do mês passou do limite do admin (app_settings 'ai',
-- alertMonthlyUsd) e ainda não houve alerta neste mês, registra e devolve os e-mails dos admins.
CREATE OR REPLACE FUNCTION ai_spend_alert_check()
RETURNS TABLE (email text, period text, total_micros bigint, threshold_micros bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_threshold bigint;
  v_total bigint;
  v_period text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
BEGIN
  PERFORM app_assert_system();
  SELECT round((value->>'alertMonthlyUsd')::numeric * 1000000)::bigint INTO v_threshold
  FROM app_settings WHERE key = 'ai' AND jsonb_typeof(value->'alertMonthlyUsd') = 'number';
  IF v_threshold IS NULL OR v_threshold <= 0 THEN
    RETURN;
  END IF;
  v_total := ai_spend_month_micros();
  IF v_total < v_threshold THEN
    RETURN;
  END IF;
  INSERT INTO ai_spend_alerts (period, total_micros, threshold_micros)
  VALUES (v_period, v_total, v_threshold)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.email, v_period, v_total, v_threshold
    FROM role_assignments r JOIN auth_users u ON u.id = r.user_id
    WHERE r.role = 'admin';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ai_spend_alert_check() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ai_spend_alert_check() TO gutta_app;
