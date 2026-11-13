-- Documentos da disciplina: só do dono, e só ligando arquivo e disciplina do próprio aluno.
ALTER TABLE discipline_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discipline_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY discipline_documents_own ON discipline_documents FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
    AND EXISTS (SELECT 1 FROM files f WHERE f.id = file_id AND f.owner_id = (SELECT app_user_id()))
  );
