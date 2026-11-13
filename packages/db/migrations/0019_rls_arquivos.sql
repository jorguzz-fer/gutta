-- Arquivos do aluno (ADR 0012). Só o dono lê e escreve. O worker processa cada arquivo
-- dentro de withUser(dono), então as mesmas políticas valem para ele.

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY files_own ON files FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (owner_id = (SELECT app_user_id()));
--> statement-breakpoint

ALTER TABLE file_pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE file_pages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY file_pages_own ON file_pages FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM files f WHERE f.id = file_id AND f.owner_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

-- Exclusão da conta (LGPD, ADR 0009): o banco apaga as linhas em cascata, mas os objetos no
-- bucket precisam do worker. Quando a conta some, um evento pede para apagar o prefixo
-- u/{id}/ inteiro. Roda como dono do schema, então funciona também dentro de erase_user().
CREATE OR REPLACE FUNCTION enqueue_user_objects_erase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO outbox (topic, payload, dedupe_key)
  VALUES (
    'maintenance.erase_user_objects',
    jsonb_build_object('userId', OLD.id),
    'erase-objects-' || OLD.id
  )
  ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION enqueue_user_objects_erase() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER auth_users_erase_objects
  AFTER DELETE ON auth_users
  FOR EACH ROW EXECUTE FUNCTION enqueue_user_objects_erase();
