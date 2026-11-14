# Deploy no Coolify

São dois recursos no mesmo projeto do Coolify. O site estático continua como está.

| Recurso                   | O que é                               | Build                                                           | Domínio                    |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| Site estático (já existe) | página de espera e `/roadmap`         | `Dockerfile` da raiz                                            | gutta.tudomudou.com.br     |
| Plataforma (novo)         | app Next.js, worker, Redis e Postgres | Docker Compose, Base Directory `/infra`, arquivo `/compose.yml` | app-gutta.tudomudou.com.br |

## Primeira vez

1. No Coolify: **New Resource → Docker Compose**, repositório `jorguzz-fer/gutta`, branch `main`, **Base Directory `/infra`** e arquivo **`/compose.yml`**.
   Com a base em `/infra`, os caminhos relativos do compose (`..` do `web` e `./postgres` do `db`) valem igual no Coolify e na sua máquina.
2. Defina as variáveis (aba Environment Variables). Gere as senhas com `openssl rand -base64 32`:

   | Variável                                                                                   | Exemplo / observação                                                                                                                                                                                                                              |
   | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `APP_URL`                                                                                  | `https://app-gutta.tudomudou.com.br` (sem barra no fim)                                                                                                                                                                                           |
   | `BETTER_AUTH_SECRET`                                                                       | 32+ caracteres aleatórios                                                                                                                                                                                                                         |
   | `POSTGRES_PASSWORD`                                                                        | superusuário do Postgres (só para administração)                                                                                                                                                                                                  |
   | `GUTTA_OWNER_PASSWORD`                                                                     | dono do schema; usado só pelas migrations                                                                                                                                                                                                         |
   | `GUTTA_APP_PASSWORD`                                                                       | papel da aplicação (sem BYPASSRLS)                                                                                                                                                                                                                |
   | `RESEND_API_KEY`                                                                           | sem ela, nenhum e-mail sai (confirmação de conta fica travada)                                                                                                                                                                                    |
   | `MAIL_FROM`                                                                                | remetente verificado no Resend                                                                                                                                                                                                                    |
   | `LESSON_ORIGINS`                                                                           | origens das aulas interativas, ex. `https://aula.alumine.com.br`                                                                                                                                                                                  |
   | `ANTHROPIC_API_KEY`                                                                        | chave da API da Anthropic para o tutor IA (web) e a leitura de cronograma (worker); sem ela os dois ficam indisponíveis para o aluno (ADR 0008; SPEC v2, DIS-05)                                                                                  |
   | `TUTOR_MODEL`                                                                              | opcional; padrão `claude-opus-5-5`                                                                                                                                                                                                                |
   | `AI_SCHEDULE_MODEL`, `AI_SCHEDULE_EFFORT`                                                  | opcionais; modelo e esforço da leitura de cronograma (padrão `claude-opus-5-5` e `medium`). O custo de cada leitura fica em `ai_usage`                                                                                                            |
| `AI_CREATION_MODEL`, `AI_CREATION_EFFORT` | opcionais; modelo e esforço das criações da Ajuda Cognuss (padrão `claude-opus-5-5` e `medium`). Custo por criação em `ai_usage` |
   | `WORKER_NOTIFY_INTERVAL_MS`                                                                | opcional, no worker; intervalo entre as voltas do envio de avisos por e-mail (padrão 60000). O worker usa `RESEND_API_KEY`, `MAIL_FROM` e `APP_URL` como o app (SPEC v2, LEM-11)                                                                  |
   | `TUTOR_DAILY_LIMIT`                                                                        | opcional; perguntas por aluno em 24 h (padrão 20; o admin muda em `/admin/tutor`)                                                                                                                                                                 |
   | `SEED_CATALOG`                                                                             | opcional; `demo` carrega curso, disciplinas, módulos, questões e flashcards de demonstração (com selo), sem usuários. Ver ADR 0005                                                                                                                |
   | `BOOTSTRAP_ADMIN_EMAILS`                                                                   | opcional; e-mails que viram admin no start (ver "Primeiro administrador")                                                                                                                                                                         |
   | `LEGAL_CONTROLLER_NAME`, `LEGAL_CONTROLLER_DOCUMENT`                                       | LGPD: razão social e CNPJ do controlador, mostrados na política (ADR 0009). Sem valor, aparece "a definir"                                                                                                                                        |
   | `DPO_NAME`, `DPO_EMAIL`                                                                    | LGPD: encarregado de dados (art. 41). Preencha antes do piloto                                                                                                                                                                                    |
   | `REDIS_PASSWORD`                                                                           | senha do Redis da fila (ADR 0013). Gere com `openssl rand -hex 32`: só letras e números, porque ela vai dentro da URL de conexão                                                                                                                  |
   | `QUEUE_PREFIX`                                                                             | opcional; prefixo das chaves da fila (padrão `cognuss`)                                                                                                                                                                                           |
   | `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Cloudflare R2 (ADR 0012). Endpoint `https://<conta>.r2.cloudflarestorage.com`, bucket privado e uma chave restrita a ele. Sem elas, o envio de arquivos fica indisponível. **Arquivo real de aluno só depois do parecer jurídico** (SPEC v2, D06) |
   | `STORAGE_REGION`                                                                           | opcional; `auto` para o R2                                                                                                                                                                                                                        |
   | `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`                                                       | cadastro da v2 (CPF cifrado; SPEC v2, CAD-10). Gere cada uma com `openssl rand -base64 32` e guarde no cofre: sem a de cifra o CPF salvo não volta a ser lido, e trocar a de resumo quebra a regra de um CPF por conta                            |
   | `FEATURES_ON`                                                                              | opcional e só fora de produção; liga módulos da v2 sem passar por `/admin/funcionalidades`                                                                                                                                                        |

3. Domínio no serviço `web`, porta `3000`. DNS: registro `A` de `app-gutta` apontando para o VPS.
4. Deploy. No primeiro start:
   - o Postgres roda `infra/postgres/init/01-roles.sh`, que cria `gutta_owner`, `gutta_app` e o banco. O script vai **dentro da imagem** (`infra/postgres/Dockerfile`); montado como volume, chegaria vazio no Coolify;
   - o `web` aplica as migrations e só depois sobe o servidor.
5. Confira `https://app-gutta.tudomudou.com.br/api/health`, que deve responder `{"status":"ok","db":"ok"}`.

Nenhum serviço publica porta no servidor (`expose`, não `ports`): o proxy do Coolify chega ao `web` pela rede interna, e só o `web` e o `worker` alcançam o banco e o Redis.

### Worker e Redis (ADR 0013)

O compose tem mais dois serviços, que o Coolify sobe junto:

- **`redis`**: fila de trabalhos e limite de tentativas de login compartilhado entre réplicas. Guarda os dados no volume `gutta-redis` (AOF), com senha. Não guarda dado pessoal: os trabalhos levam só identificadores.
- **`worker`**: publica na fila os eventos que o app grava na tabela `outbox` e executa os trabalhos. Usa o mesmo papel do app (`gutta_app`, sem BYPASSRLS) e só sobe depois de o `web` estar saudável, porque é o `web` que aplica as migrations. A saúde fica em `http://worker:3001/health`, só na rede interna.

### Arquivos: R2 e antivírus (ADR 0012)

1. **Bucket no R2**: um por ambiente (`cognuss-qa`, `cognuss-prod`), privado, sem domínio público. Dica de localização: leste da América do Norte.
2. **CORS do bucket**: aceitar `PUT` e `GET` só a partir de `APP_URL`, com o cabeçalho `content-type`. Sem isso, o navegador não consegue enviar direto ao bucket.
3. **Chave de API** com permissão de leitura e escrita só nesse bucket.
4. **Antivírus**: o serviço `clamav` do compose baixa a base no primeiro start e leva alguns minutos para ficar saudável. O `worker` espera por ele. Ele usa cerca de 1 GB de memória: confira a folga do servidor.

Se o Redis cair, o app continua funcionando: o limite de login passa as requisições (e registra `auth.rate_limit_unavailable` no log) e os eventos esperam no `outbox` até o `worker` conseguir publicar. Os trabalhos que falham 5 vezes ficam 30 dias na lista de falhas do BullMQ.

## Primeiro administrador

Os usuários de demonstração nunca vão para produção (ADR 0005). O catálogo só entra com `SEED_CATALOG=demo`.

1. Crie a conta pelo `/cadastro`.
2. No Coolify, defina `BOOTSTRAP_ADMIN_EMAILS` com o seu e-mail (vários: separados por vírgula) e faça um redeploy.
3. No start, logo depois das migrations, cada e-mail listado que já tem conta ganha o papel `admin` e fica com o e-mail confirmado. Isso dispensa o Resend para o primeiro acesso, e a mudança fica na auditoria (`role.granted`, `user.email_verified`).

A variável não cria usuário nem guarda senha: a senha é a do cadastro. Pode deixá-la definida; rodar de novo não muda nada. No primeiro acesso a `/admin`, a plataforma pede para ativar a verificação em duas etapas.

Outras contas (professor, equipe) o admin cria em `/admin/usuarios` → Novo usuário. A senha temporária aparece uma vez na tela; a pessoa troca em Segurança → Trocar senha.

## Retenção e exclusão (LGPD)

A limpeza (`apply_retention`, ADR 0009) roda a cada start do container. Para não depender de deploy, crie uma tarefa agendada diária no Coolify, em **Scheduled Tasks** da aplicação, no serviço `web`:

- Comando: `node migrate.mjs --retention-only`
- Frequência: `17 4 * * *` (todo dia às 4h17)

Ela apaga o texto antigo das conversas do tutor, eventos e auditoria fora do prazo, sessões vencidas, e executa as exclusões cujo prazo de desistência acabou. O resultado vai para o log (`db.retention_applied`) e para a auditoria.

## Atualizações

Cada deploy reconstrói a imagem e aplica as migrations novas no start. Migrations são só para a frente; para desfazer, crie uma migration nova.

## Backup

1. No Coolify, em **Scheduled Backups** do serviço `db`, configure um dump diário do banco `gutta`, com retenção de 14 dias e destino S3 (por exemplo, Cloudflare R2).
2. Teste a restauração uma vez por mês num banco descartável:
   ```bash
   pg_restore -d gutta_restore dump.sql
   ```
3. Metas iniciais: RPO de 24 h e RTO de 2 h. Revisar antes do piloto da F3.

## Build local da imagem

```bash
docker build -f apps/web/Dockerfile -t gutta-web .
```

Atrás de proxy com certificado próprio, acrescente `--secret id=ca,src=/caminho/ca.crt`.
