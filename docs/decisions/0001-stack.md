# ADR 0001: Stack do MVP

- Status: aceito
- Data: 2026-11-02

## Contexto
A SPEC (§9, D03) propõe Next.js + Supabase, "passível de revisão". O Engineering Blueprint do time recomenda TypeScript ponta a ponta, PostgreSQL e deploy em VPS com Docker Compose; os outros projetos do time rodam no Coolify. O time tem uma pessoa de tecnologia, e o piloto é de uma turma (40+ alunos) a partir de fevereiro de 2027. O Fernando decidiu que o Gutta começa numa base de código nova, sem reaproveitar código de outros projetos.

## Opções consideradas
1. **Next.js + Supabase gerenciado.** Auth e RLS prontos e pouco trabalho de operação. Contra: dependência de fornecedor na camada mais sensível, custo que cresce com o uso, e um ambiente de deploy diferente do resto do time.
2. **NestJS (API) + React (web) em monorepo.** É o padrão do blueprint. Contra: duas aplicações para uma pessoa manter, antes de existir um segundo cliente (app nativo ou integração).
3. **Next.js como monólito modular (BFF + API `/api/v1`) + PostgreSQL próprio no Coolify + Drizzle.**

## Decisão
Opção 3.
- **Next.js 16 (App Router)** com route handlers versionados em `/api/v1` e server actions. É um processo só, com o servidor como fronteira de confiança.
- **Monorepo pnpm**: `apps/web`, `packages/core` (domínio puro, reusável por workers e por um app nativo futuro) e `packages/db`.
- **PostgreSQL 16** em container no mesmo projeto do Coolify. Sem porta pública.
- **Drizzle ORM** com migrations SQL versionadas. É SQL previsível, que é o que o RLS pede (ADR 0003).
- **Tailwind 4** com tokens próprios (`apps/web/src/styles`), sem biblioteca de componentes pesada.
- **Zod** para validar todo payload no servidor.
- **Vitest** para testes unitários e de integração contra Postgres real, e **Playwright** para E2E.

## Consequências
- Backup, atualização e monitoramento do Postgres ficam com o time (ver `docs/deploy.md`).
- Se surgir um app nativo ou uma integração de terceiros, `/api/v1` já existe; o próximo passo seria extrair o contrato para OpenAPI.
- Tutor IA, filas e jobs entram como módulos do mesmo monólito até a escala justificar separar.
