# ADR 0013: Fila de trabalhos e processo `worker`

- Status: aceito (Fernando, 13/11/2026)
- Data: 2026-11-13

## Contexto

A v2 tem trabalho que não cabe numa requisição: varrer, converter e indexar arquivos (ADR 0012), extrair cronogramas, gerar resumos e questões com IA, e mandar notificações na hora marcada. Esse trabalho precisa:
- aguentar a queda do processo;
- tentar de novo com espera crescente;
- separar o que falhou de vez numa fila de mortos;
- mostrar o estado ao aluno.

O blueprint (§2, §3) recomenda Redis e efeitos colaterais por eventos de domínio em fila, com nova tentativa e fila de mortos.

O ADR 0006 deixou uma pendência: o limite de taxa da autenticação fica em memória e passa a contar por réplica quando houver duas. Ele precisa de um armazenamento compartilhado.

## Opções consideradas

1. **Fila no próprio Postgres** (tabela com `FOR UPDATE SKIP LOCKED`, ou pg-boss). Sem componente novo. Contra: não resolve o limite de taxa compartilhado nem o armazenamento efêmero do áudio (Fase 7, com expiração automática), e põe carga de sondagem no banco que guarda os dados dos alunos.
2. **Serviço gerenciado de fila.** Contra: mais um operador com dados do aluno e mais um fornecedor, para um volume pequeno.
3. **Redis no mesmo compose, com BullMQ, e um processo `worker` separado.**

## Decisão

Opção 3.

**Redis**
- Redis 7 no `infra/compose.yml`, sem porta publicada e com senha.
- Persistência AOF, para a fila sobreviver a um reinício.
- Usos:
  - filas do BullMQ;
  - limite de taxa compartilhado, que fecha a pendência do ADR 0006;
  - mais tarde, o armazenamento efêmero do áudio.
- **Dado pessoal não fica no Redis.** O conteúdo de um trabalho leva só identificadores (`user_id`, `file_id`, `request_id`); o `worker` lê o resto do Postgres dentro de `withUser()`. A exceção, o áudio, terá ADR próprio (0018).

**Processo `worker`**
- `apps/worker`: o mesmo código e os mesmos pacotes (`@gutta/core`, `@gutta/db`), com outro comando de entrada.
- Imagem própria, por causa do ClamAV e do LibreOffice (ADR 0012).
- Conecta ao banco como `gutta_app`, sem BYPASSRLS, e abre `withUser()` para cada trabalho. Trabalho de sistema, como a retenção, usa as funções `SECURITY DEFINER` que já existem.
- Concorrência por fila, configurável. Conversão e IA ficam em filas separadas, para uma não travar a outra.

**Filas iniciais:** `files` (varrer, converter, extrair, indexar), `ai` (extrair cronograma, gerar criação), `notifications` (enviar na hora marcada), `maintenance` (apagar objetos de conta excluída, retenção).

**Regras para todo trabalho**
- **Idempotente**: o identificador do trabalho é derivado do que ele faz (`file:{id}:extract`), então publicar duas vezes não duplica.
- **Nova tentativa** com espera exponencial, 5 tentativas por padrão. Esgotadas, o trabalho vai para a fila de mortos e o estado da entidade vira `failed`, com motivo legível.
- **Registro**: cada trabalho carrega o `request_id` de origem, e o registro estruturado do `worker` usa o mesmo formato do `web`.
- **Painel**: o admin vê as filas, as falhas e pode mandar refazer, numa tela em `/admin` protegida pelo 2FA. Nada de painel exposto à internet.

**Eventos de domínio.** O serviço grava a mudança no Postgres e, na mesma transação, uma linha em `outbox`. Um laço no `worker` lê o `outbox` e publica na fila. Assim, um trabalho nunca é publicado para uma mudança que não foi gravada, e nada se perde se o Redis estiver fora do ar no momento.

## Consequências

- O compose ganha dois serviços: `redis` e `worker`. No Coolify, cada um é um serviço do mesmo projeto.
- Variáveis novas: `REDIS_URL` e `WORKER_CONCURRENCY_*`.
- O CI ganha um serviço Redis nos testes de integração.
- Se o Redis cair, o app continua lendo e gravando; os trabalhos esperam no `outbox` e saem quando ele voltar.
- O limite de taxa da autenticação muda de lugar. É preciso testar que o comportamento atual se mantém.
