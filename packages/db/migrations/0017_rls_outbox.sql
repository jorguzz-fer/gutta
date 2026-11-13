-- Outbox (ADR 0013). O app grava eventos na mesma transação da mudança, como o aluno
-- (withUser). Ninguém lê nem altera a tabela direto: o worker usa as funções abaixo, sem
-- usuário no contexto. Assim um aluno não descobre eventos de outro pelo app.

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outbox_insert ON outbox FOR INSERT WITH CHECK (published_at IS NULL);
--> statement-breakpoint
REVOKE SELECT, UPDATE, DELETE ON outbox FROM gutta_app;
--> statement-breakpoint

-- Só o worker (conexão sem usuário no contexto) drena a fila. Dentro de uma requisição do
-- app, app.user_id está preenchido e a chamada é recusada.
CREATE OR REPLACE FUNCTION app_assert_system() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'gutta_app' AND app_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'só o worker' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;
--> statement-breakpoint

-- Eventos prontos para publicar. FOR UPDATE SKIP LOCKED: duas instâncias do worker não
-- pegam o mesmo evento. As travas valem até o fim da transação de quem chamou.
CREATE OR REPLACE FUNCTION outbox_pending(p_limit int)
RETURNS TABLE (id bigint, topic text, payload jsonb, dedupe_key text, created_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM app_assert_system();
  RETURN QUERY
    SELECT o.id, o.topic, o.payload, o.dedupe_key, o.created_at
    FROM outbox o
    WHERE o.published_at IS NULL AND o.available_at <= now()
    ORDER BY o.id
    LIMIT greatest(1, least(p_limit, 500))
    FOR UPDATE SKIP LOCKED;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION outbox_mark_published(p_ids bigint[]) RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int;
BEGIN
  PERFORM app_assert_system();
  UPDATE outbox SET published_at = now() WHERE id = ANY(p_ids) AND published_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
--> statement-breakpoint

-- Publicados há mais de p_days dias saem da tabela. Pendentes nunca são apagados aqui.
CREATE OR REPLACE FUNCTION outbox_prune(p_days int) RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int;
BEGIN
  PERFORM app_assert_system();
  DELETE FROM outbox
  WHERE published_at IS NOT NULL AND published_at < now() - make_interval(days => greatest(p_days, 1));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_assert_system() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_pending(int) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_mark_published(bigint[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_prune(int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_pending(int) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_mark_published(bigint[]) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_prune(int) TO gutta_app;
