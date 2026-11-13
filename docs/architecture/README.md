# Arquitetura da plataforma

Monólito modular (ADR 0001): um app Next.js 16 é ao mesmo tempo telas, BFF e API `/api/v1`, sobre um PostgreSQL 16 com RLS forçado. Tudo roda no Coolify do time.

```mermaid
flowchart LR
  A[Navegador do aluno ou da equipe] -->|HTTPS, cookie httpOnly| P[Proxy do Coolify]
  P --> W[apps/web · Next.js]
  subgraph W[apps/web]
    PX[proxy.ts: CSP e checagem de cookie]
    UI[Telas RSC e server actions]
    API["/api/v1 · route handlers"]
    AUTH[Better Auth]
    SV[features/*: serviços]
  end
  SV --> CORE[packages/core: domínio puro]
  SV --> DB[(PostgreSQL 16)]
  AUTH --> DB
  SV -. log .-> MAIL[MailProvider: log ou Resend]
```

## Camadas

| Camada | Onde | Regras |
|---|---|---|
| Domínio puro | `packages/core` | Sem I/O. Estimativa de domínio, seleção de questão, recomendação, revisão espaçada e datas por fuso. Coberto por testes unitários. |
| Dados | `packages/db` | Schema Drizzle, migrations SQL com RLS e triggers, seeds e `withUser()`. |
| Serviços | `apps/web/src/features/*/service.ts` | Regra de aplicação. Toda consulta pessoal roda em `withUser` **e** filtra pelo dono. |
| Entradas | `app/api/v1/**`, server actions | Validação Zod; identidade só da sessão; contrato de erro `{ code, message, requestId }`. |
| Telas | `app/**/page.tsx`, `components/*` | RSC por padrão; componentes de cliente só onde há interação. |

## Segurança em camadas

1. **`proxy.ts`:** sem cookie de sessão, a área logada nem renderiza. Também monta a CSP por requisição.
2. **`requireUser` e `requireRole`:** sessão válida, e-mail confirmado, papel exigido e 2FA para admin.
3. **Serviço:** filtro explícito pelo dono. É isso que impede admin e revisor, que leem tudo pelo RLS, de verem dados de outros nas próprias telas.
4. **RLS (ADR 0003):** `gutta_app` não tem BYPASSRLS. Sem usuário no contexto, nada pessoal aparece.
5. **Triggers:** o banco corrige a tentativa (`grade_attempt`) e impõe o workflow editorial (`enforce_editorial_transition`). Tentativas, revisões, consentimentos e auditoria são só de inserção.

## Fluxo de uma resposta

1. `GET /api/v1/questions/sessions/:id/next` devolve enunciado e alternativas, sem gabarito.
2. `POST /api/v1/questions/attempts` grava a tentativa com a chave idempotente do cliente. O trigger corrige, o serviço recalcula o domínio do assunto e o evento `question_answered` é registrado.
3. A resposta traz a explicação de cada alternativa, as referências (ou "sem referência cadastrada") e a faixa de domínio.

## Dados

As migrations ficam em `packages/db/migrations`, em ordem:

| Migration | Conteúdo |
|---|---|
| 0000, 0001 | Identidade, catálogo, RLS, workflow editorial |
| 0002 | Campos de bloqueio do 2FA |
| 0003, 0004 | Banco de questões, tentativas, domínio, recomendações |
| 0005, 0006 | Flashcards, agendamentos e revisões |
| 0007, 0008 | Leitura dos próprios eventos (LGPD); recomendações lidas por admin (métricas) |
| 0009 a 0015 | Papel de professor, turmas, tutor IA e pacote LGPD |
| 0016, 0017 | Outbox de eventos, com RLS e funções só para o worker (ADR 0013) |
| 0018, 0019 | Arquivos do aluno e texto por página, com RLS; gatilho que pede a limpeza do bucket quando a conta é excluída (ADR 0012) |
| 0020, 0021 | Vida acadêmica do aluno: semestres, disciplinas, docentes e temas, com RLS; cópia das disciplinas do MVP (SPEC v2, 8.1) |
| 0022, 0023 | Dados pessoais com CPF cifrado, perfil da v2 e cursos da saúde (CAD-01 a CAD-10) |
| 0024, 0025 | Cronograma e plano de ensino ligados à disciplina (DIS-02, DIS-03) |
| 0026, 0027 | Aulas, avaliações, leitura do cronograma pela IA e uso de IA (DIS-05, DIS-07); provas do MVP (`exam_dates`) viram avaliações |
| 0028, 0029 | Rotina semanal (`routine_blocks`) e preferências de planejamento (meta semanal, grade) |

Os timestamps são sempre `timestamptz` em UTC. "Hoje" e os vencimentos usam o fuso do aluno (`profiles.timezone`, padrão `America/Sao_Paulo`).

## Verificação (estado em 02/11/2026)

| Verificação | Resultado |
|---|---|
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | ok |
| Unitários (`packages/core`) | 31 passando |
| Integração (Postgres, RLS e isolamento) | 26 em `packages/db` e 4 nos serviços do app |
| Unitários do app (CSP) | 2 passando |
| `pnpm build` | ok |
| E2E Playwright (desktop e celular, axe WCAG 2.2 AA) | 13 passando |
| Teste de carga (k6, ver `docs/carga/relatorio.html`) | 100 alunos com p95 de 102 ms; teto de cerca de 230 por réplica |
| Imagem Docker e compose (testados localmente) | builda, sobe, aplica migrations e roda como não-root |

## Riscos conhecidos

- **Conteúdo:** nada do que está no seed tem revisão científica. Antes do teste de corredor, o módulo MCH precisa entrar pelo editorial e ser aprovado pelo Hugo (ADR 0005).
- **E-mail:** sem `RESEND_API_KEY` em produção, ninguém confirma a conta. O domínio de envio precisa estar verificado no Resend antes do teste de corredor.
- **Termos e privacidade:** texto em rascunho; falta a revisão jurídica (SPEC D09).
- **Aula interativa:** se o site da aula bloquear iframe (`X-Frame-Options`), o módulo mostra um quadro vazio. Há o link "Abrir a aula em tela cheia", mas falta detectar o bloqueio (ver `docs/ux.md`).
- **Escala:** o rate limit de login fica em memória. Ao ligar a segunda réplica, ele precisa ir para o banco (ADR 0006).

## Ciclo 2 (03/11/2026)

- **Admin da empresa** (`/admin`): catálogo completo, instituições e usuários, sobre o mesmo RLS.
- **Painel do professor** (`/professor`): turmas com código. O professor só lê agregados por funções do banco, contando o que o aluno fez depois de entrar (ADR 0008).
- **Tutor IA** (no módulo e em `/admin/tutor`): `AIProvider` com Anthropic e uma implementação de teste. O contexto é só o resumo publicado e as questões que o aluno já respondeu. Há cota diária, registro de tokens e custo, e 30 casos de avaliação (ADR 0008).

- **Usuários pelo admin**: criar conta com senha temporária (mostrada uma vez) e trocar senha em `/seguranca/senha`.
- **LGPD** (`/app/privacidade`, `/admin/privacidade`, ADR 0009, `docs/lgpd/`): exclusão executada por `erase_user`, pedidos do titular com prazo, consentimento específico do tutor, retenção por `apply_retention` e novo aceite quando a política muda.

## Próximo passo

1. Preencher controlador e encarregado (`LEGAL_CONTROLLER_*`, `DPO_*`), criar a tarefa diária de retenção no Coolify e levar `docs/lgpd/` à revisão jurídica.
2. Cadastrar `ANTHROPIC_API_KEY` e rodar `pnpm --filter @gutta/web tutor:eval` antes de abrir o tutor para a turma piloto.
3. Pipeline de geração assistida de questões e flashcards, alimentando a fila editorial que já existe.
4. Questão do dia e lembretes pelo WhatsApp, PWA instalável (F2 do roadmap).
