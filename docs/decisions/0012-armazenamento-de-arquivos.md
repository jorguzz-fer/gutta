# ADR 0012: Armazenamento e processamento de arquivos

- Status: proposto
- Data: 2026-11-13

## Contexto

A v2 passa a guardar arquivos dos alunos: slides, provas, atividades, cronogramas e planos de ensino (SPEC v2, MAT e 7.4). Hoje a plataforma não guarda arquivo nenhum.

Requisitos da SPEC v2:
- Arquivo privado por padrão, servido só depois da autorização, por URL assinada curta. Tipo conferido pelo conteúdo.
- Um arquivo, vários vínculos, sem cópia (MAT-15). Versões (MAT-16). Lixeira (MAT-21).
- Texto e miniatura por página, para busca e citação.
- Conversão de PPTX e DOCX para PDF.
- Exclusão completa quando a conta é apagada (LGPD, 10.1).

O Fernando decidiu (D06) usar o **Cloudflare R2**:
- sem teto de espaço por aluno durante o QA;
- até 50 MB por arquivo;
- arquivo real de aluno só depois do parecer jurídico sobre a transferência internacional, porque o R2 não tem região no Brasil;
- plano B: Amazon S3 em São Paulo.

## Opções consideradas

1. **Arquivos no disco do VPS, servidos pelo app.** Sem custo extra. Contra: o disco e o backup ficam por nossa conta, o processo web carrega cada download e uma segunda réplica não enxerga o disco da primeira.
2. **Arquivos no Postgres (`bytea`).** Um só backup. Contra: banco e backup crescem com cada PDF, e o pool de conexões fica preso servindo arquivos.
3. **Armazenamento de objetos compatível com S3 (R2), com envio e download diretos por URL assinada.**

## Decisão

Opção 3.

**Bucket e chaves**
- Um bucket privado por ambiente (`cognuss-dev`, `cognuss-qa`, `cognuss-prod`), sem acesso público e sem domínio público.
- Chave do objeto: `u/{user_id}/f/{file_id}/original`, com `…/pages/{n}.webp` para miniaturas e `…/pdf` para a versão convertida. O prefixo por aluno permite apagar tudo de uma pessoa de uma vez.
- Dica de localização: leste da América do Norte (`enam`), a mais próxima do Brasil.

**Código**
- Interface `ObjectStorage` em `apps/web/src/lib/storage`, com duas implementações:
  - S3 (cliente oficial da AWS apontado para o endpoint do R2);
  - memória, para testes.
- Nada de recurso exclusivo do R2 (Workers, vínculos de bucket). Trocar para o S3 em São Paulo é mudar `STORAGE_ENDPOINT`, `STORAGE_REGION` e as chaves, mais copiar os objetos.

**Envio e download**
1. `POST /api/v1/files`: confere sessão, tamanho (50 MB) e tipo declarado. Cria a linha em `files` (`uploading`) e devolve uma URL de envio assinada por 10 minutos, presa ao tamanho e ao tipo.
2. O navegador envia direto ao bucket. O arquivo não passa pelo processo web.
3. `POST /api/v1/files/:id/complete`: confere o objeto (tamanho e resumo SHA-256) e publica `file.uploaded` na fila (ADR 0013).
4. Download: `GET /api/v1/files/:id/url` autoriza dentro de `withUser()` e devolve uma URL assinada por 5 minutos, com `Content-Disposition` e `Content-Type` fixados pelo servidor.

**Deduplicação.** O resumo SHA-256 é único **por aluno**. Dois alunos com o mesmo PDF guardam dois objetos: deduplicar entre alunos revelaria que outra pessoa tem o mesmo arquivo.

**Processamento**, cada etapa um trabalho idempotente na fila:
1. **Varrer**: ClamAV no `worker`. Arquivo infectado vai para `quarantined` e é apagado do bucket.
2. **Conferir o tipo pelo conteúdo** (assinatura do arquivo), não pela extensão.
3. **Converter**: LibreOffice sem interface, em processo isolado, sem rede e com tempo limite, só para PPTX e DOCX.
4. **Extrair**: texto e miniatura por página do PDF.
5. **Indexar**: busca (ADR 0014).

Uma falha em qualquer etapa deixa o arquivo `failed` com o motivo; o original continua disponível para ver e baixar.

**Ciclo de vida**
- Exclusão lógica: a lixeira guarda por 30 dias, e depois a retenção apaga os objetos.
- `erase_user` publica `user.erased`, e o `worker` apaga o prefixo `u/{user_id}/` inteiro, registrando a confirmação na auditoria.

**Backup.** Os arquivos não entram no dump do Postgres. A redundância é a do próprio R2. A cópia para um segundo bucket fica para antes do piloto, com o RPO e o RTO revistos no `docs/deploy.md`.

**Antes de arquivo real de aluno** (trava da D06):
- parecer jurídico sobre a transferência;
- contrato com a Cloudflare;
- Cloudflare citada como operadora na política.

Até lá, o ambiente de QA usa só arquivos de teste.

## Consequências

- Variáveis novas: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`. A chave de acesso fica restrita a um bucket.
- A CSP passa a permitir o domínio do endpoint em `connect-src` (envio) e `img-src` (miniaturas).
- O `worker` precisa de ClamAV e LibreOffice na imagem, o que a deixa bem maior que a do `web`. Por isso o `worker` ganha um Dockerfile próprio, sobre o mesmo código.
- O ClamAV carrega a base de assinaturas na memória (da ordem de 1 GB) e precisa atualizá-la todo dia. O VPS precisa ter folga para isso; se não tiver, a varredura vira um serviço separado ou um processo que roda só na hora da fila.
- O bucket precisa de CORS que aceite `PUT` só a partir de `APP_URL`.
- Custo pela tabela do R2: US$ 0,015 por GB ao mês acima de 10 GB grátis; download sem custo.
