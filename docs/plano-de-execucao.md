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

- [x] 11. Onboarding (ONB-01): curso, instituição (catálogo + "não encontrei"), semestre, disciplinas, meta de minutos/dia, dias de estudo, prova opcional. Idempotente. Editável depois em `/app/perfil`.
- [x] 12. Catálogo (CAT-01): `/app/disciplinas`, `/app/disciplinas/[slug]`, página de módulo com player da aula interativa (iframe com sandbox), resumo e chamadas para questões e flashcards.
- [x] 13. Banco de questões (QUE-01): schema `questions`, `question_options`, `question_sources`, `question_sessions`, `question_attempts`, `topic_mastery`, `learning_recommendations`, com RLS. Seeds com questões de demonstração.
- [x] 14. Sessão de questões: criar sessão (treino ou diagnóstico), próxima questão **sem gabarito**, tentativa corrigida no servidor com chave idempotente, feedback com explicação de cada alternativa e referência, histórico.
- [x] 15. Domínio V1 e recomendações (QUE-02) em `packages/core`: estimativa por recência e dificuldade, "sem diagnóstico" com amostra pequena, prioridade revisões atrasadas > assunto fraco com prova próxima > assunto ativo > exploração; motivo e versão do algoritmo persistidos. Testes unitários.
- [x] 16. Flashcards (FC-01): revisão espaçada inspirada no SM-2 em `packages/core` (esqueci/difícil/bom/fácil), fila de vencidos com fuso horário, criação de flashcard pessoal a partir de questão errada, itens privados isolados. Testes unitários e de isolamento.
- [x] 17. Dashboard (HOME-01): próxima ação com justificativa, questão do dia, revisões vencidas com tempo estimado, disciplinas e lacunas, provas, progresso da semana. Funciona sem histórico.
- [x] 18. Editorial (ADM-01): `/admin/questoes` com fluxo `draft → in_review → approved → published → archived`; autor não aprova a própria questão; só revisor publica; versão e revisor registrados; auditoria. Questão não publicada não aparece no estudo.
- [x] 19. Privacidade: `/app/privacidade` com preferências por finalidade, exportação dos dados em JSON e pedido de exclusão.
- [x] 20. Eventos de produto (ANA-01) nas ações-chave e `/admin/metricas` com WALS e contagens reais.
- [x] 21. E2E (Playwright): cadastro → verificação → onboarding → 5 questões → feedback → flashcard → dashboard; editor → revisor → publicação. Varredura de acessibilidade automatizada no fluxo principal.
- [x] 22. Teste de carga (skill teste-de-carga): `loadtest/` com mapa de todas as rotas, cenário k6 ponderado, smoke, carga, estresse e pico contra build de produção local com banco populado; gargalos corrigidos; relatório HTML; job de CI.
- [x] 23. Revisão de UX (skill leis-de-ux) das telas do fluxo principal, correções aplicadas, `docs/ux.md` com decisões de UX.
- [x] 24. Documentação final: README, `docs/architecture`, resultado real das verificações, riscos e próximo passo (tutor IA, M3).

## Fora deste ciclo (de propósito)

Tutor IA (SPEC §19.2 manda concluir e testar a fundação antes), comunidades, identidade digital e e-mail no domínio (fora do MVP pelo roadmap), WhatsApp, painel do professor, pagamentos, PWA instalável.

## Ciclo 2 (pedido do Fernando, 03/11/2026): admin da empresa, painel do professor e tutor IA

Escopo vindo do roadmap (F1: tutor IA; F2: painel do professor) e do pedido de um painel de admin da empresa. Mesma regra: só marca `[x]` com código, testes e commit.

- [x] 25. Admin: CRUD de cursos, disciplinas, assuntos e módulos (com o fluxo editorial do banco), instituições (aprovar as sugeridas) e usuários (papéis, confirmar e-mail, encerrar sessões). Papel `teacher` no banco. Tudo auditado e protegido pelo RLS. Testes de integração e E2E.
- [x] 26. Professor: turmas com código de entrada, aluno entra sabendo que o professor verá o desempenho dele, painel com desempenho por assunto, erros mais comuns e quem está ficando para trás. RLS e testes de isolamento entre turmas.
- [x] 27. Tutor IA (SPEC M3): `AIProvider` com implementação Anthropic e de teste, respostas só com base no conteúdo publicado do módulo, recusa de pedido clínico real, cota diária por aluno, registro de uso e custo (`ai_usage`), conversas guardadas. Admin vê uso, custo e conversas e pode desligar o tutor. Bateria de casos de avaliação.
- [x] 28. Admin cria usuário (nome, e-mail, papel, e-mail confirmado) com senha temporária mostrada uma vez; tela de trocar senha em Segurança. E2E.
- [x] 29. Pacote LGPD (ADR 0009, `docs/lgpd/`): exclusão executada no banco (`erase_user`) com prazo de desistência e fila do admin em `/admin/privacidade`; pedidos do titular (correção, informação, oposição) com prazo de 15 dias e resposta no app; consentimento específico para o tutor IA e apagar o texto das conversas; retenção configurável (`apply_retention`) no start, em tarefa diária e por botão; novo aceite quando a política muda; política e termos completos com bases legais, operadores e prazos; controlador e encarregado por variável; logs sem e-mail. Registro das operações, RIPD e plano de incidentes em rascunho. Testes de banco, integração e E2E.
- [x] 30. Marca Cognuss (ADR 0010): logo com o "C" no quadrado vermelho, favicon, nome em todas as telas, e-mails, termos, política, tutor, 2FA, página de espera e roadmap. Nomes internos do código seguem `gutta`.

## Ciclo 3 (pedido do Fernando, 13/11/2026): Cognuss v2

Fonte de verdade do produto neste ciclo: `docs/spec/SPEC_Cognuss_v2.md`, escrita a partir do documento do Dr. Hugo e do Dr. Rafael (ADR 0011). O backlog completo, com as oito fases, está na seção 12 da SPEC v2. Aqui ficam só as Fases 0 e 1; as seguintes entram quando a anterior fechar.

### Fase 0: preparação

- [x] 31. SPEC v2 aprovada pelo Fernando em 13/11/2026; decisões que bloqueavam o início (D01 a D07) fechadas e registradas; ADR 0011 aceito.
- [x] 32. ADRs 0012 (armazenamento de arquivos, conversão e antivírus), 0013 (fila e `worker`), 0014 (busca), 0019 (contrato OpenAPI).
- [x] 33. Infraestrutura: Redis e bucket privado no compose e no Coolify; `apps/worker` com imagem própria (ADR 0013); `pgvector` no Postgres; limite de taxa no Redis (pendência do ADR 0006). Variáveis no `.env.example`.
- [x] 34. Chaves de funcionalidade por módulo em `app_settings`; `packages/contracts` com os esquemas Zod de `/api/v1` gerando o OpenAPI 3.1.
- [x] 35. Caminho de um arquivo (SPEC v2, 7.4): pedir envio, URL assinada, confirmação, varredura, conversão, texto e miniaturas por página, estado visível. Testes de isolamento e de idempotência dos trabalhos.
- [ ] 36. Experimento de extração de cronograma com 20 cronogramas reais: acerto por campo e custo médio. Experimento do visualizador com caneta no iPad e em tablet Android. Resultados em `docs/`.
  - Preparado em 13/11/2026: extração em `packages/ai` (saída validada pelo esquema), rotina `pnpm --filter @gutta/ai schedule:eval` com gabarito por arquivo (`docs/experimentos/cronogramas/README.md`) e página `/admin/lab/caneta` (`docs/experimentos/caneta.md`).
  - **Falta (depende do Fernando):** os 20 cronogramas reais com o gabarito, a `ANTHROPIC_API_KEY` para rodar, e o teste no iPad e no tablet Android. O item fecha quando os resultados estiverem registrados.
- [x] 37. Telas de referência adaptadas ao tema escuro e vermelho do app (D03): paleta de categorias para a grade e o calendário, nos dois temas, com contraste AA. Feito: 8 cores em `tokens.css` (`--cat-1` a `--cat-8`, com texto e borda), cores fixas por tipo de evento em `styles/categories.ts`, teste de contraste nos dois temas e prévia em `/admin/lab/paleta`.

### Fase 1: fundação da vida acadêmica

- [x] 38. Modelo acadêmico: `student_terms`, `enrolled_disciplines`, `discipline_teachers`, `discipline_topics`, com RLS e migração de `student_disciplines` e `exam_dates`. Feito: migrations 0020 e 0021, com a cópia das disciplinas do MVP para o semestre atual. As tabelas antigas ficam enquanto o painel do MVP existir; `exam_dates` migra no item 41, junto com `assessments`. A exportação LGPD já leva as tabelas novas e os arquivos.
- [ ] 39. Cadastro (CAD-01 a CAD-10): dados pessoais com CPF (protegido) e telefone obrigatórios, perfil acadêmico (qualquer curso da saúde) e objetivo, retomável e idempotente. Substitui o onboarding do MVP.
- [ ] 40. Disciplinas (DIS-01 a DIS-03, DIS-09, DIS-10): cadastro, docentes, upload de cronograma e de plano de ensino.
- [ ] 41. Extração do cronograma com tela de conferência e confirmação (DIS-05, DIS-07); `lessons` e `assessments` criados só depois de confirmar.
- [ ] 42. `packages/core/recurrence` e `packages/core/agenda`: projeção única de ocorrências, com testes unitários.
- [ ] 43. Rotina semanal (ROT-01 a ROT-10, ROT-12, ROT-17): grade, categorias, recorrência, horários protegidos, meta e resumo.
- [ ] 44. Agenda geral (CAL-14) e Meu Espaço inicial (ESP-01 a ESP-06, ESP-09, ESP-13).
- [ ] 45. E2E: conta nova, cadastro, cronograma conferido, rotina, Meu Espaço com a semana real. Acessibilidade no fluxo. Verificação do tom de voz dos textos.
