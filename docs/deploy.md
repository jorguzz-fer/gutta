# Deploy no Coolify

São dois recursos no mesmo projeto do Coolify. O site estático continua como está.

| Recurso | O que é | Build | Domínio |
|---|---|---|---|
| Site estático (já existe) | página de espera e `/roadmap` | `Dockerfile` da raiz | gutta.tudomudou.com.br |
| Plataforma (novo) | app Next.js + Postgres | Docker Compose, Base Directory `/infra`, arquivo `/compose.yml` | app-gutta.tudomudou.com.br |

## Primeira vez

1. No Coolify: **New Resource → Docker Compose**, repositório `jorguzz-fer/gutta`, branch `main`, **Base Directory `/infra`** e arquivo **`/compose.yml`**.
   Com a base em `/infra`, os caminhos relativos do compose (`..` do `web` e `./postgres` do `db`) valem igual no Coolify e na sua máquina.
2. Defina as variáveis (aba Environment Variables). Gere as senhas com `openssl rand -base64 32`:

   | Variável | Exemplo / observação |
   |---|---|
   | `APP_URL` | `https://app-gutta.tudomudou.com.br` (sem barra no fim) |
   | `BETTER_AUTH_SECRET` | 32+ caracteres aleatórios |
   | `POSTGRES_PASSWORD` | superusuário do Postgres (só para administração) |
   | `GUTTA_OWNER_PASSWORD` | dono do schema; usado só pelas migrations |
   | `GUTTA_APP_PASSWORD` | papel da aplicação (sem BYPASSRLS) |
   | `RESEND_API_KEY` | sem ela, nenhum e-mail sai (confirmação de conta fica travada) |
   | `MAIL_FROM` | remetente verificado no Resend |
   | `LESSON_ORIGINS` | origens das aulas interativas, ex. `https://aula.alumine.com.br` |
   | `ANTHROPIC_API_KEY` | chave da API da Anthropic para o tutor IA; sem ela o tutor fica desligado (ADR 0008) |
   | `TUTOR_MODEL` | opcional; padrão `claude-opus-5-5` |
   | `TUTOR_DAILY_LIMIT` | opcional; perguntas por aluno em 24 h (padrão 20; o admin muda em `/admin/tutor`) |
   | `SEED_CATALOG` | opcional; `demo` carrega curso, disciplinas, módulos, questões e flashcards de demonstração (com selo), sem usuários. Ver ADR 0005 |
   | `BOOTSTRAP_ADMIN_EMAILS` | opcional; e-mails que viram admin no start (ver "Primeiro administrador") |

3. Domínio no serviço `web`, porta `3000`. DNS: registro `A` de `app-gutta` apontando para o VPS.
4. Deploy. No primeiro start:
   - o Postgres roda `infra/postgres/init/01-roles.sh`, que cria `gutta_owner`, `gutta_app` e o banco. O script vai **dentro da imagem** (`infra/postgres/Dockerfile`); montado como volume, chegaria vazio no Coolify;
   - o `web` aplica as migrations e só depois sobe o servidor.
5. Confira `https://app-gutta.tudomudou.com.br/api/health`, que deve responder `{"status":"ok","db":"ok"}`.

Nenhum dos dois publica porta no servidor (`expose`, não `ports`): o proxy do Coolify chega ao `web` pela rede interna, e só o `web` alcança o banco.

## Primeiro administrador

Os usuários de demonstração nunca vão para produção (ADR 0005). O catálogo só entra com `SEED_CATALOG=demo`.

1. Crie a conta pelo `/cadastro`.
2. No Coolify, defina `BOOTSTRAP_ADMIN_EMAILS` com o seu e-mail (vários: separados por vírgula) e faça um redeploy.
3. No start, logo depois das migrations, cada e-mail listado que já tem conta ganha o papel `admin` e fica com o e-mail confirmado. Isso dispensa o Resend para o primeiro acesso, e a mudança fica na auditoria (`role.granted`, `user.email_verified`).

A variável não cria usuário nem guarda senha: a senha é a do cadastro. Pode deixá-la definida; rodar de novo não muda nada. No primeiro acesso a `/admin`, a plataforma pede para ativar a verificação em duas etapas.

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
