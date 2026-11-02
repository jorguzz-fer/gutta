-- Flashcards: pessoais isolados por aluno; editoriais seguem o workflow.
REVOKE UPDATE, DELETE ON flashcard_reviews FROM gutta_app;
--> statement-breakpoint

-- O workflow editorial só vale para cartões editoriais; os pessoais são livres do dono.
CREATE OR REPLACE FUNCTION guard_flashcard_editorial() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'gutta_app' OR NEW.visibility = 'private' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'cartão editorial novo começa como rascunho' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IN ('approved', 'published', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (app_has_role('reviewer') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'só revisor aprova ou publica' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status <> 'approved'
     AND NEW.author_id IS NOT DISTINCT FROM app_user_id() THEN
    RAISE EXCEPTION 'o autor não aprova o próprio conteúdo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER flashcards_editorial_guard BEFORE INSERT OR UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION guard_flashcard_editorial();
--> statement-breakpoint

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE flashcards FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY flashcards_read ON flashcards FOR SELECT
  USING (
    owner_id = (SELECT app_user_id())
    OR (owner_id IS NULL AND status = 'published')
    OR (owner_id IS NULL AND (SELECT app_is_editorial()))
  );
--> statement-breakpoint
CREATE POLICY flashcards_own_write ON flashcards FOR ALL
  USING (owner_id = (SELECT app_user_id()))
  WITH CHECK (owner_id = (SELECT app_user_id()) AND visibility = 'private');
--> statement-breakpoint
CREATE POLICY flashcards_editorial_write ON flashcards FOR ALL
  USING (owner_id IS NULL AND (SELECT app_is_editorial()))
  WITH CHECK (owner_id IS NULL AND visibility = 'editorial' AND (SELECT app_is_editorial()));
--> statement-breakpoint

ALTER TABLE flashcard_schedules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE flashcard_schedules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY flashcard_schedules_own ON flashcard_schedules FOR ALL
  USING (student_id = (SELECT app_user_id()))
  WITH CHECK (
    student_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM flashcards f WHERE f.id = flashcard_id)
  );
--> statement-breakpoint

ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE flashcard_reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY flashcard_reviews_own_read ON flashcard_reviews FOR SELECT
  USING (student_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY flashcard_reviews_own_insert ON flashcard_reviews FOR INSERT
  WITH CHECK (
    student_id = (SELECT app_user_id())
    AND EXISTS (SELECT 1 FROM flashcards f WHERE f.id = flashcard_id)
  );
--> statement-breakpoint
CREATE POLICY flashcard_reviews_admin_read ON flashcard_reviews FOR SELECT
  USING ((SELECT app_has_role('admin')));
