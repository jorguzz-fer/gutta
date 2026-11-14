-- Cadastro da v2 (SPEC v2, CAD-01 a CAD-10).

-- Dados pessoais: só o dono. O CPF chega aqui já cifrado pelo app; o resumo com chave
-- garante um CPF por conta sem guardar o número em claro.
ALTER TABLE personal_data ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE personal_data FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY personal_data_own ON personal_data FOR ALL
  USING (user_id = (SELECT app_user_id()))
  WITH CHECK (user_id = (SELECT app_user_id()));
--> statement-breakpoint

-- Cursos da saúde (decisão D05: qualquer curso de graduação da saúde). Só os nomes: o
-- conteúdo do acervo continua existindo apenas onde houver material revisado. "Outro curso
-- da saúde" leva o nome digitado pelo aluno em student_profiles.course_other.
INSERT INTO courses (name, slug, active, is_demo) VALUES
  ('Medicina', 'medicina', true, false),
  ('Enfermagem', 'enfermagem', true, false),
  ('Odontologia', 'odontologia', true, false),
  ('Farmácia', 'farmacia', true, false),
  ('Fisioterapia', 'fisioterapia', true, false),
  ('Nutrição', 'nutricao', true, false),
  ('Biomedicina', 'biomedicina', true, false),
  ('Medicina Veterinária', 'medicina-veterinaria', true, false),
  ('Psicologia', 'psicologia', true, false),
  ('Educação Física', 'educacao-fisica', true, false),
  ('Fonoaudiologia', 'fonoaudiologia', true, false),
  ('Terapia Ocupacional', 'terapia-ocupacional', true, false),
  ('Outro curso da saúde', 'outro-curso-da-saude', true, false)
ON CONFLICT (slug) DO NOTHING;
