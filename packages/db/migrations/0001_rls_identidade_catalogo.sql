-- Isolamento de dados (ADR 0003).
-- Requer os papéis gutta_owner (dono, BYPASSRLS) e gutta_app (aplicação, sem BYPASSRLS),
-- criados por packages/db/src/scripts/setup-local.ts ou infra/postgres/init/01-roles.sh.

-- ── Contexto da requisição ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
--> statement-breakpoint

-- SECURITY DEFINER: roda como gutta_owner (BYPASSRLS), então consultar role_assignments
-- dentro de uma política não entra em recursão.
CREATE OR REPLACE FUNCTION app_has_role(r app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_assignments WHERE user_id = app_user_id() AND role = r
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_is_editorial() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_assignments
    WHERE user_id = app_user_id() AND role IN ('editor', 'reviewer', 'admin')
  )
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app_has_role(app_role) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_is_editorial() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id() TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_has_role(app_role) TO gutta_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_editorial() TO gutta_app;
--> statement-breakpoint

-- ── Permissões do papel da aplicação ──────────────────────────────────────
GRANT USAGE ON SCHEMA public TO gutta_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gutta_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gutta_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gutta_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gutta_app;
--> statement-breakpoint
-- A tabela de migrations do Drizzle fica fora do alcance da aplicação.
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM gutta_app;
--> statement-breakpoint

-- Registros imutáveis: a aplicação só insere.
REVOKE UPDATE, DELETE ON audit_logs, product_events, consent_records FROM gutta_app;
--> statement-breakpoint

-- ── Workflow editorial (ADM-01) ───────────────────────────────────────────
-- Barra no banco o que a SPEC proíbe: pular a revisão, o autor aprovar o próprio conteúdo
-- e alguém sem papel de revisor publicar. Seeds (gutta_owner) passam direto.
CREATE OR REPLACE FUNCTION enforce_editorial_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor text := app_user_id();
  is_reviewer boolean := app_has_role('reviewer') OR app_has_role('admin');
BEGIN
  IF current_user <> 'gutta_app' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'in_review') THEN
      RAISE EXCEPTION 'conteúdo novo começa como rascunho ou em revisão'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    -- Conteúdo publicado não muda no lugar: edição gera nova versão em rascunho.
    IF OLD.status IN ('approved', 'published') AND NOT is_reviewer THEN
      RAISE EXCEPTION 'conteúdo aprovado ou publicado só muda por revisor'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'in_review') OR
    (OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved')) OR
    (OLD.status = 'approved' AND NEW.status IN ('published', 'draft')) OR
    (OLD.status = 'published' AND NEW.status = 'archived') OR
    (OLD.status = 'archived' AND NEW.status IN ('published', 'draft'))
  ) THEN
    RAISE EXCEPTION 'transição editorial inválida: % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('approved', 'published', 'archived') OR
     (OLD.status = 'in_review' AND NEW.status = 'draft') THEN
    IF NOT is_reviewer THEN
      RAISE EXCEPTION 'só revisor aprova, devolve, publica ou arquiva'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status = 'approved' THEN
    IF NEW.author_id IS NOT DISTINCT FROM actor THEN
      RAISE EXCEPTION 'o autor não aprova o próprio conteúdo'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reviewer_id := actor;
  END IF;

  IF NEW.status = 'published' THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER modules_editorial_transition
  BEFORE INSERT OR UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION enforce_editorial_transition();
--> statement-breakpoint

-- ── RLS: dados do aluno ───────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profiles_own ON profiles FOR ALL
  USING (user_id = (SELECT app_user_id()))
  WITH CHECK (user_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY profiles_staff_read ON profiles FOR SELECT
  USING ((SELECT app_has_role('admin')) OR (SELECT app_has_role('support')));
--> statement-breakpoint

ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE role_assignments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY role_assignments_read ON role_assignments FOR SELECT
  USING (user_id = (SELECT app_user_id()) OR (SELECT app_has_role('admin')));
--> statement-breakpoint
CREATE POLICY role_assignments_admin_insert ON role_assignments FOR INSERT
  WITH CHECK ((SELECT app_has_role('admin')));
--> statement-breakpoint
CREATE POLICY role_assignments_admin_delete ON role_assignments FOR DELETE
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY student_profiles_own ON student_profiles FOR ALL
  USING (user_id = (SELECT app_user_id()))
  WITH CHECK (user_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE student_disciplines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_disciplines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY student_disciplines_own ON student_disciplines FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (student_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE exam_dates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE exam_dates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY exam_dates_own ON exam_dates FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (student_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY consent_records_own_read ON consent_records FOR SELECT
  USING (user_id = (SELECT app_user_id()) OR (SELECT app_has_role('admin')));
--> statement-breakpoint
CREATE POLICY consent_records_own_insert ON consent_records FOR INSERT
  WITH CHECK (user_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE data_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY data_requests_own ON data_requests FOR ALL
  USING (user_id = (SELECT app_user_id()))
  WITH CHECK (user_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY data_requests_admin ON data_requests FOR ALL
  USING ((SELECT app_has_role('admin')))
  WITH CHECK ((SELECT app_has_role('admin')));
--> statement-breakpoint

-- ── RLS: catálogo ─────────────────────────────────────────────────────────
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY institutions_read ON institutions FOR SELECT
  USING (
    status = 'active'
    OR suggested_by = (SELECT app_user_id())
    OR (SELECT app_is_editorial())
  );
--> statement-breakpoint
-- Aluno sugere uma instituição que não encontrou; entra como pendente.
CREATE POLICY institutions_suggest ON institutions FOR INSERT
  WITH CHECK (
    (status = 'pending' AND suggested_by = (SELECT app_user_id()))
    OR (SELECT app_has_role('admin'))
  );
--> statement-breakpoint
CREATE POLICY institutions_admin_update ON institutions FOR UPDATE
  USING ((SELECT app_has_role('admin')))
  WITH CHECK ((SELECT app_has_role('admin')));
--> statement-breakpoint
CREATE POLICY institutions_admin_delete ON institutions FOR DELETE
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY courses_read ON courses FOR SELECT
  USING (active OR (SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY courses_admin_write ON courses FOR ALL
  USING ((SELECT app_has_role('admin')))
  WITH CHECK ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE disciplines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE disciplines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY disciplines_read ON disciplines FOR SELECT
  USING (active OR (SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY disciplines_editorial_write ON disciplines FOR ALL
  USING ((SELECT app_is_editorial()))
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE topics FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY topics_read ON topics FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY topics_editorial_write ON topics FOR ALL
  USING ((SELECT app_is_editorial()))
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE modules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY modules_read ON modules FOR SELECT
  USING (status = 'published' OR (SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY modules_editorial_insert ON modules FOR INSERT
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY modules_editorial_update ON modules FOR UPDATE
  USING ((SELECT app_is_editorial()))
  WITH CHECK ((SELECT app_is_editorial()));
--> statement-breakpoint
CREATE POLICY modules_admin_delete ON modules FOR DELETE
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

-- ── RLS: operação ─────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (actor_id IS NOT DISTINCT FROM (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY audit_logs_admin_read ON audit_logs FOR SELECT
  USING ((SELECT app_has_role('admin')));
--> statement-breakpoint

ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY product_events_insert ON product_events FOR INSERT
  WITH CHECK (actor_id IS NOT DISTINCT FROM (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY product_events_admin_read ON product_events FOR SELECT
  USING ((SELECT app_has_role('admin')));
