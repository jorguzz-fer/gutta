# ADR 0003: Isolamento de dados com RLS

- Status: aceito
- Data: 2026-11-02

## Contexto

SPEC §3 e §13.2: autorização no servidor e, onde se aplica, por Row Level Security; nenhuma consulta cruzada entre alunos, validada por teste automatizado. O blueprint pede defesa em profundidade: filtro na aplicação e RLS no banco, com o usuário da aplicação sem BYPASSRLS.

## Decisão

- Dois papéis no Postgres:
  - `gutta_owner` é dono do schema e roda migrations e seeds;
  - `gutta_app` é o usado pela aplicação, sem `BYPASSRLS` e sem ser dono das tabelas.
- Tabelas com dados do aluno têm `ENABLE` e `FORCE ROW LEVEL SECURITY`.
- Cada requisição autenticada abre uma transação e executa `select set_config('app.user_id', $1, true)` e `set_config('app.roles', $2, true)` (helper `withUser`). As políticas comparam `owner = current_setting('app.user_id', true)`.
- Fora de `withUser` (sem usuário no contexto), as políticas do aluno não devolvem linha nenhuma: falham fechadas.
- Conteúdo editorial publicado (cursos, disciplinas, módulos, questões publicadas) é legível por qualquer sessão. Rascunhos só por quem tem papel editorial.
- As tabelas do Better Auth (`user`, `session`, `account`, `verification`, `two_factor`) **não** têm RLS: só o módulo de autenticação as acessa, antes de existir um usuário no contexto. O papel `gutta_app` tem acesso a elas, e nenhuma rota de domínio as consulta.

## Consequências

- Esquecer o `where student_id = …` no código não vaza dados: o banco barra.
- O gabarito (`question_options.is_correct`) fica numa tabela legível, mas a API nunca o serializa antes da tentativa. Essa proteção é da aplicação, e há teste que verifica isso.
- Os testes de integração rodam como `gutta_app` contra um Postgres real.
