-- Forma de cálculo da média (SPEC v2, NOT): só do dono, em disciplina do próprio aluno.

ALTER TABLE grading_schemes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grading_schemes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY grading_schemes_own ON grading_schemes FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (
    owner_id = (SELECT app_user_id())
    AND EXISTS (
      SELECT 1 FROM enrolled_disciplines d
      WHERE d.id = discipline_id AND d.owner_id = (SELECT app_user_id())
    )
  );
