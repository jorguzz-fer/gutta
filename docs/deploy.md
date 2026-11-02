# Deploy no Coolify

São dois recursos no mesmo projeto do Coolify. O site estático continua como está.

| Recurso | O que é | Build | Domínio |
|---|---|---|---|
| Site estático (já existe) | página de espera e `/roadmap` | `Dockerfile` da raiz | gutta.tudomudou.com.br |
| Plataforma (novo) | app Next.js + Postgres | Docker Compose, arquivo `infra/compose.yml` | app.gutta.tudomudou.com.br (sugestão) |

## Primeira vez

1. No Coolify: **New Resource → Docker Compose**, repositório `jorguzz-fer/gutta`, branch `main`, arquivo `infra/compose.yml`.
2. Defina as variáveis (aba Environment Variables). Gere as senhas com `openssl rand -base64 32`:

   | Variável | Exemplo / observação |
   |---|---|
   | `APP_URL` | `https://app.gutta.tudomudou.com.br` (sem barra no fim) |
   | `BETTER_AUTH_SECRET` | 32+ caracteres aleatórios |
   | `POSTGRES_PASSWORD` | superusuário do Postgres (só para administração) |
   | `GUTTA_OWNER_PASSWORD` | dono do schema; usado só pelas migrations |
   | `GUTTA_APP_PASSWORD` | papel da aplicação (sem BYPASSRLS) |
   | `RESEND_API_KEY` | sem ela, nenhum e-mail sai (confirmação de conta fica travada) |
   | `MAIL_FROM` | remetente verificado no Resend |
   | `LESSON_ORIGINS` | origens das aulas interativas, ex. `https://aula.alumine.com.br` |

3. Domínio no serviço `web`, porta `3000`. DNS: registro `A` de `app.gutta` apontando para o VPS.
4. Deploy. No primeiro start:
   - o Postgres roda `infra/postgres/init/01-roles.sh`, que cria `gutta_owner`, `gutta_app` e o banco;
   - o `web` aplica as migrations e só depois sobe o servidor.
5. Confira `https://app.gutta…/api/health`, que deve responder `{"status":"ok","db":"ok"}`.

O banco não publica porta: só o `web` o alcança, pela rede interna do compose.

## Primeiro administrador

Não há seed em produção (ADR 0005). Crie a conta pelo `/cadastro`, confirme o e-mail e, no terminal do serviço `db` no Coolify, rode:

```sql
psql -U postgres -d gutta -c "insert into role_assignments (user_id, role) select id, 'admin' from auth_users where email = 'voce@exemplo.com';"
```

No próximo acesso a `/admin`, a plataforma pede para ativar a verificação em duas etapas.

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
