# ADR 0010: Marca Cognuss

- Status: aceito
- Data: 2026-11-07

## Contexto
O Fernando trocou o nome do projeto: de Gutta Project para **Cognuss**. O domínio novo ele configura no Coolify e no DNS.

## Decisão
- **Logo:** "C" branco com ponto num quadrado vermelho da marca (`#c2181d`, cantos de 14/64), ao lado de **COGNUSS** em Archivo Black, na cor de destaque do tema. É a opção C de três apresentadas. O quadrado garante contraste nos temas claro e escuro e é o mesmo desenho do favicon (`apps/web/src/app/icon.svg`) e da página de espera.
- **Componente:** `Wordmark` e `Mark` em `apps/web/src/components/shared/logo.tsx`.
- **Textos:** o nome visível ao aluno, ao professor e ao admin passa a ser Cognuss: títulos das páginas, e-mails, termos, política, tutor IA, emissor do 2FA, página de espera e roadmap.
- **O que não muda:** identificadores internos (papéis `gutta_owner` e `gutta_app`, banco, pacotes `@gutta/*`, prefixo de cookie `gutta`, chave `gutta-theme` no navegador, nome do repositório). Trocar o prefixo de cookie derrubaria as sessões, e trocar os papéis exigiria migração no banco de produção, sem ganho para o usuário.

## Consequências
- Quem já cadastrou o 2FA continua vendo "Gutta" no app autenticador até cadastrar de novo; contas novas veem "Cognuss".
- O endereço de envio (`MAIL_FROM`) só muda de domínio quando o Fernando configurar o novo no Resend e no Coolify.
