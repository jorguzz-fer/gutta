-- LGPD (SPEC §13.1; ADR 0009). Três coisas que o app sozinho não pode fazer pelo RLS:
-- 1. Executar a exclusão da conta (art. 18, VI): apaga a pessoa e tudo o que é dela, mas
--    só com pedido aberto da própria pessoa e nunca de quem ainda é admin.
-- 2. Apagar o texto das conversas com o tutor a pedido do aluno, mantendo tokens e custo.
-- 3. Retenção: prazos por categoria em app_settings ('retention'), aplicados por função.
-- O aluno não escreve a resposta do pedido nem marca como atendido: só abre e desiste.
-- Sem literal do enum consent_purpose aqui: 'ai_tutor' foi criado na mesma execução.

DROP POLICY IF EXISTS data_requests_own ON data_requests;
--> statement-breakpoint
CREATE POLICY data_requests_own_read ON data_requests FOR SELECT
  USING (user_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY data_requests_own_insert ON data_requests FOR INSERT
  WITH CHECK (
    user_id = (SELECT app_user_id()) AND response IS NULL AND resolved_by IS NULL
  );
--> statement-breakpoint
CREATE POLICY data_requests_own_cancel ON data_requests FOR UPDATE
  USING (user_id = (SELECT app_user_id()) AND status = 'open')
  WITH CHECK (
    user_id = (SELECT app_user_id()) AND status = 'cancelled'
    AND response IS NULL AND resolved_by IS NULL
  );
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_assert_admin_or_system() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Chamada pelo app: precisa ser admin. Pelo dono do banco (start do container): sistema.
  IF session_user = 'gutta_app' AND NOT app_has_role('admin') THEN
    RAISE EXCEPTION 'só admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION erase_user(p_user text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req data_requests%ROWTYPE;
BEGIN
  PERFORM app_assert_admin_or_system();
  SELECT * INTO req FROM data_requests
  WHERE user_id = p_user AND kind = 'deletion' AND status = 'open'
  ORDER BY created_at LIMIT 1;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'sem pedido de exclusão aberto para essa conta' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM role_assignments WHERE user_id = p_user AND role::text = 'admin') THEN
    RAISE EXCEPTION 'tire o papel de admin antes de excluir essa conta' USING ERRCODE = 'check_violation';
  END IF;
  -- Eventos de uso ficam só como contagem anônima; a auditoria guarda o id, sem nome nem e-mail.
  UPDATE product_events SET actor_id = NULL WHERE actor_id = p_user;
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    app_user_id(), 'data.deletion_executed', 'user', p_user,
    jsonb_build_object(
      'requested_at', req.created_at,
      'mode', CASE WHEN app_user_id() IS NULL THEN 'automatic' ELSE 'admin' END
    )
  );
  -- Cascata: sessões, senha, perfis, respostas, revisões, cartões, consentimentos, turmas,
  -- conversas e pedidos. Conteúdo editorial que a pessoa escreveu fica, sem autor.
  DELETE FROM auth_users WHERE id = p_user;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION redact_my_tutor_history() RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me text := app_user_id();
  n int;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'sem usuário no contexto' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE tutor_messages SET content = '', redacted_at = now()
  WHERE student_id = me AND redacted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
--> statement-breakpoint

-- Prazos em dias. Valores iniciais de rascunho, a confirmar na revisão jurídica (D09).
INSERT INTO app_settings (key, value)
VALUES ('retention', '{"tutorDays": 365, "eventsDays": 730, "auditDays": 1825, "deletionGraceDays": 15}')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION apply_retention() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg jsonb;
  tutor_days int;
  events_days int;
  audit_days int;
  grace_days int;
  n_tutor int;
  n_events int;
  n_audit int;
  n_sessions int;
  n_tokens int;
  n_erased int := 0;
  n_skipped int := 0;
  r record;
  result jsonb;
BEGIN
  PERFORM app_assert_admin_or_system();
  SELECT value INTO cfg FROM app_settings WHERE key = 'retention';
  tutor_days := greatest(coalesce((cfg->>'tutorDays')::int, 365), 30);
  events_days := greatest(coalesce((cfg->>'eventsDays')::int, 730), 90);
  audit_days := greatest(coalesce((cfg->>'auditDays')::int, 1825), 365);
  grace_days := least(greatest(coalesce((cfg->>'deletionGraceDays')::int, 15), 0), 15);

  UPDATE tutor_messages SET content = '', redacted_at = now()
  WHERE redacted_at IS NULL AND created_at < now() - make_interval(days => tutor_days);
  GET DIAGNOSTICS n_tutor = ROW_COUNT;

  DELETE FROM product_events WHERE created_at < now() - make_interval(days => events_days);
  GET DIAGNOSTICS n_events = ROW_COUNT;

  DELETE FROM audit_logs WHERE created_at < now() - make_interval(days => audit_days);
  GET DIAGNOSTICS n_audit = ROW_COUNT;

  DELETE FROM auth_sessions WHERE expires_at < now();
  GET DIAGNOSTICS n_sessions = ROW_COUNT;

  DELETE FROM auth_verifications WHERE expires_at < now();
  GET DIAGNOSTICS n_tokens = ROW_COUNT;

  -- Pedidos de exclusão vencidos (o aluno teve o prazo para desistir). Admin fica de fora.
  FOR r IN
    SELECT DISTINCT user_id FROM data_requests
    WHERE kind = 'deletion' AND status = 'open'
      AND created_at < now() - make_interval(days => grace_days)
  LOOP
    BEGIN
      PERFORM erase_user(r.user_id);
      n_erased := n_erased + 1;
    EXCEPTION WHEN check_violation THEN
      n_skipped := n_skipped + 1;
    END;
  END LOOP;

  result := jsonb_build_object(
    'tutorMessagesRedacted', n_tutor, 'eventsDeleted', n_events, 'auditDeleted', n_audit,
    'sessionsDeleted', n_sessions, 'tokensDeleted', n_tokens,
    'accountsErased', n_erased, 'accountsSkipped', n_skipped
  );
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (app_user_id(), 'data.retention_applied', 'system', NULL, result);
  RETURN result;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_assert_admin_or_system() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION erase_user(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION redact_my_tutor_history() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION apply_retention() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION erase_user(text) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION redact_my_tutor_history() TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION apply_retention() TO gutta_app;
