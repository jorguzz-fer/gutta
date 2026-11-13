# Cognuss: instruções para o Claude Code

Plataforma de estudo diário para o curso de Medicina. O nome da marca é **Cognuss** desde 07/11/2026 (antes "Gutta Project"; ADR 0010). Identificadores internos (banco, pacotes `@gutta/*`, cookies, repositório) continuam `gutta`. Base de código nova, sem reaproveitar código de outros projetos (decisão do Fernando, 02/11/2026).

## Fontes de verdade

1. `docs/spec/SPEC_Cognuss_v2.md`: produto e escopo da v2, a partir do documento do Dr. Hugo e do Dr. Rafael (ADR 0011). Rascunho até a aprovação; as decisões pendentes estão na seção 14. Telas de referência em `docs/spec/cognuss-v2/telas/`.
2. `docs/spec/Engineering_Blueprint.md`: padrão de engenharia do time. A seção 7.2 da SPEC v2 mostra como a v2 o cumpre.
3. `docs/spec/SPEC_Plataforma_Integrada_Estudantes_Saude_v1.md`: SPEC do MVP. Continua valendo para engenharia (RLS, idempotência, testes, definição de pronto) e para o que já foi construído.
4. `public/roadmap/index.html`: calendário do time (roadmap v2). Ainda descreve o MVP; em conflito de **escopo**, vale a SPEC v2 até o roadmap ser atualizado.
5. `docs/plano-de-execucao.md`: checklist do ciclo atual. Pegue sempre o próximo item não marcado.
6. `docs/decisions/`: ADRs. Toda escolha arquitetural nova vira ADR.

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
- Conteúdo de saúde sem revisão editorial é sempre marcado como demonstração. Conteúdo gerado por IA a partir do material do aluno leva o selo de gerado por IA, sem revisão. Não inventar fontes, citações nem dados institucionais.
- Nada muda a agenda do aluno sem ele confirmar. Horário pessoal protegido nunca é usado para estudo. Sem texto de culpa ou cobrança (SPEC v2, seção 6).
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
