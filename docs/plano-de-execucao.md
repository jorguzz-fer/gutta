# Plano de execução: fundação (M0) e aprendizagem ativa mínima (M1)

Fonte de verdade do produto: `docs/spec/SPEC_Plataforma_Integrada_Estudantes_Saude_v1.md`.
Padrão de engenharia: `docs/spec/Engineering_Blueprint.md`.
Escopo e calendário do time: `public/roadmap/index.html` (roadmap v2). Quando a SPEC e o roadmap divergem no **escopo**, vale o roadmap, que é mais recente. Para **engenharia**, vale a SPEC e o blueprint.

Cada item só é marcado `[x]` quando o código está escrito, os testes do item passam e o commit foi feito. Ordem importa: não pular itens.

## M0. Fundação técnica

- [x] 01. Monorepo pnpm (`apps/web`, `packages/core`, `packages/db`), Next.js 16 + TypeScript 5.9 + Tailwind 4, ESLint, Prettier, `.nvmrc`, `.env.example`, scripts raiz (`lint`, `typecheck`, `test`, `build`). O site estático em `public/` e o `Dockerfile` raiz continuam intactos.
- [x] 02. ADRs em `docs/decisions/` (stack, auth, RLS, escopo SPEC × roadmap, conteúdo de demonstração).
- [x] 03. Design tokens Gutta (paleta e fontes da página de espera) em `apps/web/src/styles`, componentes base acessíveis (`Button`, `Input`, `Field`, `Card`, `EmptyState`, `ErrorState`, `Skeleton`), tema claro e escuro.
- [x] 04. Banco: schema Drizzle e migrations SQL para identidade e catálogo (`user`/`session`/`account`/`verification` do Better Auth, `profiles`, `role_assignments`, `institutions`, `courses`, `disciplines`, `topics`, `modules`, `student_profiles`, `student_disciplines`, `exam_dates`, `consent_records`, `audit_logs`, `product_events`). Papel `gutta_app` sem BYPASSRLS; RLS com `FORCE` nas tabelas do aluno; `withUser()` faz `set_config('app.user_id', …, true)` por transação.
- [x] 05. Seeds de demonstração marcados como tal: curso Medicina, trilha cardiovascular (módulo MCH e mais um), instituições de exemplo, usuários de teste (aluno, editor, revisor, admin).
- [x] 06. Autenticação com Better Auth: cadastro com aceite de termos e consentimentos separados, verificação de e-mail, login, recuperação de senha, sair de todas as sessões. `MailProvider` com implementação de log (dev) e Resend (prod). Rate limit. TOTP obrigatório para admin.
- [x] 07. RBAC no servidor (`requireUser`, `requireRole`), `proxy.ts` protegendo `/app` e `/admin`, layouts do aluno e do admin, páginas `/entrar`, `/cadastro`, `/recuperar-senha`, `/verificar-email`.
- [x] 08. Testes de isolamento (integração contra Postgres real): aluno A não lê nem altera dados do aluno B; visitante não acessa API privada; papel `gutta_app` não ignora RLS.
- [x] 09. Docker: `apps/web/Dockerfile` (multi-stage, não-root, `output: standalone`), `docker-compose.yml` (web + postgres), migrations no start, `/api/health`. Guia de deploy no Coolify em `docs/deploy.md`.
- [x] 10. CI no GitHub Actions: lint, typecheck, unit, integração com serviço Postgres, build, E2E.

## M1. Aprendizagem ativa mínima

- [ ] 11. Onboarding (ONB-01): curso, instituição (catálogo + "não encontrei"), semestre, disciplinas, meta de minutos/dia, dias de estudo, prova opcional. Idempotente. Editável depois em `/app/perfil`.
- [ ] 12. Catálogo (CAT-01): `/app/disciplinas`, `/app/disciplinas/[slug]`, página de módulo com player da aula interativa (iframe com sandbox), resumo e chamadas para questões e flashcards.
- [ ] 13. Banco de questões (QUE-01): schema `questions`, `question_options`, `question_sources`, `question_sessions`, `question_attempts`, `topic_mastery`, `learning_recommendations`, com RLS. Seeds com questões de demonstração.
- [ ] 14. Sessão de questões: criar sessão (treino ou diagnóstico), próxima questão **sem gabarito**, tentativa corrigida no servidor com chave idempotente, feedback com explicação de cada alternativa e referência, histórico.
- [ ] 15. Domínio V1 e recomendações (QUE-02) em `packages/core`: estimativa por recência e dificuldade, "sem diagnóstico" com amostra pequena, prioridade revisões atrasadas > assunto fraco com prova próxima > assunto ativo > exploração; motivo e versão do algoritmo persistidos. Testes unitários.
- [ ] 16. Flashcards (FC-01): revisão espaçada inspirada no SM-2 em `packages/core` (esqueci/difícil/bom/fácil), fila de vencidos com fuso horário, criação de flashcard pessoal a partir de questão errada, itens privados isolados. Testes unitários e de isolamento.
- [ ] 17. Dashboard (HOME-01): próxima ação com justificativa, questão do dia, revisões vencidas com tempo estimado, disciplinas e lacunas, provas, progresso da semana. Funciona sem histórico.
- [ ] 18. Editorial (ADM-01): `/admin/questoes` com fluxo `draft → in_review → approved → published → archived`; autor não aprova a própria questão; só revisor publica; versão e revisor registrados; auditoria. Questão não publicada não aparece no estudo.
- [ ] 19. Privacidade: `/app/privacidade` com preferências por finalidade, exportação dos dados em JSON e pedido de exclusão.
- [ ] 20. Eventos de produto (ANA-01) nas ações-chave e `/admin/metricas` com WALS e contagens reais.
- [ ] 21. E2E (Playwright): cadastro → verificação → onboarding → 5 questões → feedback → flashcard → dashboard; editor → revisor → publicação. Varredura de acessibilidade automatizada no fluxo principal.
- [ ] 22. Teste de carga (skill teste-de-carga): `loadtest/` com mapa de todas as rotas, cenário k6 ponderado, smoke, carga, estresse e pico contra build de produção local com banco populado; gargalos corrigidos; relatório HTML; job de CI.
- [ ] 23. Revisão de UX (skill leis-de-ux) das telas do fluxo principal, correções aplicadas, `docs/ux.md` com decisões de UX.
- [ ] 24. Documentação final: README, `docs/architecture`, resultado real das verificações, riscos e próximo passo (tutor IA, M3).

## Fora deste ciclo (de propósito)

Tutor IA (SPEC §19.2 manda concluir e testar a fundação antes), comunidades, identidade digital e e-mail no domínio (fora do MVP pelo roadmap), WhatsApp, painel do professor, pagamentos, PWA instalável.
