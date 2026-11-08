# Cognuss

Plataforma de estudo diário para o curso de Medicina.

*Um pouco, todo dia.* Antes chamado Gutta Project (ADR 0010); os nomes internos do código continuam `gutta`.

Este repositório tem duas coisas que são publicadas separadamente:

| Parte | O que é | Deploy |
|---|---|---|
| `public/` | Página de espera e `/roadmap` (HTML estático, sem build) | `Dockerfile` da raiz, em gutta.tudomudou.com.br |
| `apps/`, `packages/` | Plataforma do aluno e editorial (Next.js + PostgreSQL) | `infra/compose.yml` no Coolify; ver [docs/deploy.md](docs/deploy.md) |

## Plataforma: o que já funciona (M0 e M1)

- **Conta:** cadastro com consentimentos separados, confirmação de e-mail, login, recuperação de senha, sair de todos os aparelhos e 2FA obrigatório para admin.
- **Primeiro acesso:** onboarding em 3 passos (curso, instituição, semestre, disciplinas, meta diária e prova opcional), editável no perfil.
- **Painel "Hoje":** próxima ação com o motivo dela, questão do dia, revisões, domínio por assunto (em faixas, sem porcentagem falsa), semana e provas.
- **Estudo:**
  - questões corrigidas no servidor, com explicação de cada alternativa;
  - módulos com aula interativa e resumo;
  - flashcards com revisão espaçada no fuso do aluno, incluindo o cartão criado a partir de um erro.
- **Editorial:** rascunho → revisão → aprovada → publicada → arquivada, com versões e auditoria. O autor não aprova o próprio conteúdo.
- **Privacidade (LGPD):** preferências por finalidade, exportação dos dados e pedido de exclusão.
- **Métricas do piloto:** WALS, ativação, retenção D1 e D7, uso do banco de questões.

Todo conteúdo de saúde do seed é **demonstração, sem revisão editorial**, e aparece com esse selo.

Documentação:

- [Arquitetura](docs/architecture/README.md)
- [Decisões (ADRs)](docs/decisions/)
- [UX](docs/ux.md)
- [Teste de carga](loadtest/README.md)
- [Plano de execução](docs/plano-de-execucao.md)
- [SPEC](docs/spec/SPEC_Plataforma_Integrada_Estudantes_Saude_v1.md)

## Rodar localmente

Requisitos: Node 22, pnpm 10 e PostgreSQL 16 (local ou em container).

```bash
pnpm install
```

```bash
cp .env.example .env
```

Preencha o `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Depois:

```bash
pnpm db:setup
```

Isso cria os papéis e o banco, aplica as migrations e carrega os seeds de demonstração.

```bash
pnpm dev
```

Usuários de demonstração (senha `gutta-demo-2026`):

| E-mail | Papel |
|---|---|
| `aluno@gutta.test` | aluno; cai no onboarding |
| `editor@gutta.test` | editor |
| `revisor@gutta.test` | revisão |
| `admin@gutta.test` | admin; pede 2FA no primeiro acesso a `/admin` |

Em desenvolvimento os e-mails não saem: o link de confirmação aparece no terminal do `pnpm dev`.

## Verificações

```bash
pnpm lint && pnpm format:check && pnpm typecheck
```

```bash
pnpm test
```

O `pnpm test` roda os testes unitários e os de integração contra o Postgres (banco `gutta_test`).

```bash
pnpm build && pnpm e2e
```

O E2E roda o Playwright contra o build de produção, num banco próprio (`gutta_e2e`).

A CI (`.github/workflows/`) roda tudo isso em todo PR, mais CodeQL, gitleaks e o build da imagem Docker. O teste de carga (k6) só roda sob pedido: Actions → Teste de carga → Run workflow.

## Time

Dr. Kleber Ferreira (coordenação estratégica) · Hugo Orsini (conteúdo e academia, Uni9) · Rafael Dias (operações) · Fernando Jorge (produto, tecnologia e marca)
