# Gutta Project: instruções para o Claude Code

Plataforma de estudo diário para a graduação em saúde. Nome provisório "Gutta Project" até a resposta do INPI. Base de código nova, sem reaproveitar código de outros projetos (decisão do Fernando, 02/11/2026).

## Fontes de verdade

1. `docs/spec/SPEC_Plataforma_Integrada_Estudantes_Saude_v1.md`: produto e engenharia.
2. `docs/spec/Engineering_Blueprint.md`: padrão de engenharia do time.
3. `public/roadmap/index.html`: escopo e calendário (roadmap v2). Em conflito de **escopo**, vale o roadmap.
4. `docs/plano-de-execucao.md`: checklist do ciclo atual. Pegue sempre o próximo item não marcado.
5. `docs/decisions/`: ADRs. Toda escolha arquitetural nova vira ADR.

## Estrutura

```
public/            site estático (página de espera e /roadmap), servido pelo Dockerfile raiz. Não mexer sem pedido.
apps/web/          Next.js 16 (App Router): telas, route handlers /api/v1, server actions
packages/core/     regras de domínio puras (SRS, domínio, recomendação, normalização). Sem I/O.
packages/db/       schema Drizzle, migrations SQL, RLS, seeds, withUser()
loadtest/          k6
docs/              spec, ADRs, arquitetura, deploy, UX
```

## Regras

- Português do Brasil na interface, nos comentários e na documentação. Identificadores de código em inglês.
- Servidor é a fronteira de confiança. Identidade vem da sessão, nunca do corpo da requisição.
- Todo acesso a dados do aluno passa por `withUser(userId, tx => …)`, que liga o RLS. O papel `gutta_app` não tem BYPASSRLS.
- Gabarito nunca vai ao navegador antes da tentativa.
- Conteúdo de saúde sem revisão editorial é sempre marcado como demonstração. Não inventar fontes, citações nem dados institucionais.
- Sem segredos no código. Variáveis em `.env.example`.
- Antes de dizer que algo funciona: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Relate o resultado real.
- Conventional Commits, em português. Commits pequenos.

## Comandos

```bash
pnpm install
pnpm db:setup        # cria papéis e banco local, aplica migrations e seeds
pnpm dev             # http://localhost:3000
pnpm test            # unit + integração (precisa do Postgres)
pnpm e2e             # Playwright
```
