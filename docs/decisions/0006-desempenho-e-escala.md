# ADR 0006: Desempenho e escala do MVP

- Status: aceito
- Data: 2026-11-02

## Contexto

O teste de carga (`loadtest/`, relatório em `docs/carga/relatorio.html`) mediu o build de produção com volume de cerca de 2 vezes o piloto inteiro. O gargalo foi a CPU do único processo Node; o Postgres ficou folgado, com todas as consultas abaixo de 1 ms em média. O painel "Hoje" era a rota mais cara.

## Decisão

1. **Dado pessoal nunca entra em cache compartilhado.** Só o catálogo publicado (questões publicadas e contagens por assunto) tem cache em memória por processo, com validade de 60 s (`apps/web/src/lib/memo.ts`). Uma publicação nova aparece no painel em até 1 minuto.
2. **Contagem e agregação ficam no SQL**, não em laços no Node, sobretudo quando envolvem fuso horário (`at time zone`).
3. **Uma transação por tela sempre que der**: o acesso (papéis e onboarding) usa uma transação com cache por requisição, e o painel inteiro roda numa transação só.
4. **Uma réplica no piloto.** O teto medido foi de cerca de 230 alunos simultâneos por réplica, contra 40 previstos no piloto. Ativar a segunda réplica no Coolify antes de cerca de 150 alunos ativos ao mesmo tempo. Com 2 réplicas, 400 alunos ficaram dentro do SLA no total. O pool do banco é de 10 conexões por réplica (`DB_POOL_MAX`), e o Postgres aceita 100.
5. **Portão de desempenho na CI**: smoke e 2 minutos com 30 alunos em todo PR, com SLA de p95 abaixo de 1 s e erros abaixo de 1%.

## Consequências

- Com 2 réplicas, o rate limit de autenticação em memória passa a contar por réplica. Antes de escalar, mover o rate limit para o banco (`rateLimit.storage = 'database'`) ou para um Redis.
- O ranking de questões difíceis em `/admin/metricas` varre todas as tentativas (58 ms com 12 mil). Materializar à noite quando passar de cerca de 1 milhão de tentativas.
- O cache de sessão do Better Auth (2 min) segue valendo: uma sessão revogada pode durar até 2 minutos.
