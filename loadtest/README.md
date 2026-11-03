# Teste de carga (k6)

Responde a "a plataforma aguenta N alunos ao mesmo tempo?" com número medido, e fica instalado na CI (`.github/workflows/carga.yml`), rodando só sob pedido: Actions → Teste de carga → Run workflow, escolhendo a branch e o número de usuários.

**Nunca rode contra produção.** O script recusa URLs `*.tudomudou.com.br` sem `ALLOW_REMOTE=1`. Isso só se usa com autorização explícita do Fernando, em janela combinada e com carga limitada.

## Como rodar (local)

```bash
pnpm --filter @gutta/db seed:load
```

Isso cria o banco `gutta_load` com 300 alunos, cerca de 416 questões, 12 mil tentativas e 3 mil agendamentos.

```bash
pnpm build
```

```bash
cd apps/web && APP_URL=http://localhost:3300 DATABASE_URL=postgres://gutta_app:gutta_app_dev@localhost:5432/gutta_load AUTH_RATE_LIMIT=off pnpm exec next start -p 3300
```

```bash
cd loadtest && k6 run -e BASE_URL=http://localhost:3300 -e PROFILE=smoke -e VUS=2 scenario.js
```

Degraus (`PROFILE`), sempre nesta ordem, parando se um falhar:

| Perfil | O que faz |
|---|---|
| `smoke` | 2 VUs por 1 min |
| `carga` | rampa até `VUS` e sustenta por 3 min |
| `estresse` | sobe até `VUS`, 2×, 3× e 4× (1 min cada) |
| `pico` | de 0 a `VUS` em 10 s |
| `resistencia` | `VUS` constantes por `DURATION` (padrão 10 min) |
| `ci` | carga curta da CI (2 min) |

Para simular réplicas, suba N instâncias e use `node tools/lb.mjs 3300 3301 3302`.

## Limites (thresholds)

- Erros abaixo de 1%.
- p95 abaixo de 1 s no total e nas rotas críticas (`painel`, `proxima_questao`, `tentativa`).
- Checks acima de 99%.

O check de `proxima_questao` também falha se a resposta trouxer `isCorrect`, ou seja, gabarito vazado.

## Mapa de rotas

O peso é a parcela das jornadas sorteadas, conforme `routes.js`.

| Rota | Método | Auth | Efeito colateral | Peso | No teste? |
|---|---|---|---|---|---|
| `/app` (painel) | GET | sim | grava recomendação 1×/dia | 25% | sim |
| `/api/v1/questions/sessions` | POST | sim | cria sessão | 30% (jornada) | sim |
| `/api/v1/questions/sessions/:id/next` | GET | sim | não | ×5 por sessão | sim |
| `/api/v1/questions/attempts` | POST | sim | grava tentativa, domínio e evento | ×5 por sessão | sim |
| `/api/v1/questions/sessions/:id` | GET | sim | não | 1 por sessão | sim |
| `/app/revisoes` | GET | sim | não | 15% (jornada) | sim |
| `/api/v1/flashcards/due` | GET | sim | não | na jornada de revisões | sim |
| `/api/v1/flashcards/:id/reviews` | POST | sim | reagenda cartão | até 3 por jornada | sim |
| `/app/disciplinas`, `/app/disciplinas/[slug]`, módulo | GET | sim | evento `module_opened` | 20% (navegação) | sim |
| `/app/questoes`, `/app/perfil`, `/app/flashcards`, `/app/privacidade` | GET | sim | não | navegação | sim |
| `/api/v1/questions/sessions`, `/api/v1/flashcards`, `/api/v1/communication-preferences` | GET | sim | não | navegação | sim |
| `/`, `/entrar`, `/cadastro`, `/termos`, `/politica-de-privacidade`, `/api/health` | GET | não | não | 8% | sim |
| `/api/v1/me/export` | GET | sim | grava `data_requests` | 1% | sim |
| `/api/v1/flashcards` | POST | sim | cria cartão | 1% | sim |
| `/api/auth/sign-in/email` | POST | não | cria sessão | só no setup | parcial |

### Fora do teste, e por quê

| Rota | Motivo |
|---|---|
| `/api/auth/sign-up/email`, `/cadastro` (envio) | Cria contas e dispara e-mail. Tem rate limit de 5/min por IP: o teste mediria o limitador, não o app. |
| `/api/auth/request-password-reset`, `/reset-password`, `/verify-email`, `/send-verification-email` | Disparam e-mail transacional (efeito externo em produção). Cobertos pelo E2E. |
| `/api/auth/two-factor/*`, `/seguranca/dois-fatores`, `/entrar/dois-fatores` | Fluxo de admin, com poucos usuários e TOTP. Coberto pelo E2E. |
| `/admin/*`, `/api/v1/admin/*` | Poucas pessoas (equipe editorial) e exigem 2FA. As consultas de `/admin/metricas` foram conferidas com EXPLAIN (ver relatório). |
| Server actions (onboarding, perfil, editorial, privacidade, cartões pessoais) | O Next gera IDs de action por build, e eles não são estáveis para o k6. Fazem as mesmas escritas das APIs cobertas e estão no E2E. |
| `/api/v1/flashcards/:id` (DELETE), `/api/v1/communication-preferences` (PATCH) | Raros e simples (uma escrita indexada). Cobertos por testes de integração. |
| `/onboarding`, `/verificar-email`, `/recuperar-senha`, `/redefinir-senha`, `/app/questoes/nova` | Páginas de uso único ou que só redirecionam. O custo real está nas APIs que elas chamam, que estão no teste. |

**Regra:** rota nova entra em `routes.js` no mesmo PR. Se não entrar, ela vai para esta tabela com o motivo.
