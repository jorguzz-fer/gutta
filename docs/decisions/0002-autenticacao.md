# ADR 0002: Autenticação e sessões

- Status: aceito
- Data: 2026-11-02

## Contexto
A SPEC (AUTH-01) pede cadastro com e-mail, confirmação, recuperação, "sair de todas as sessões" e MFA para administradores, e diz que a senha não é armazenada pela aplicação. O blueprint pede sessão server-side em cookie httpOnly, hash Argon2id, rate limit e MFA obrigatório para papéis sensíveis.

## Opções consideradas
1. **Auth.js (NextAuth) com Credentials e JWT.** Contra: sessões JWT não são revogáveis (não atende "sair de todas as sessões"); verificação de e-mail e reset ficam por nossa conta.
2. **Provedor gerenciado (Supabase Auth, Clerk, Auth0).** Contra: os dados de identidade dos alunos ficam num terceiro, o custo é por usuário ativo e a stack tem um fornecedor a mais.
3. **Better Auth, biblioteca que roda no nosso servidor e grava no nosso Postgres.**

## Decisão
Better Auth:
- sessões no banco, com cookie httpOnly, Secure e SameSite=Lax, revogáveis uma a uma ou todas;
- verificação de e-mail obrigatória antes de acessar `/app`;
- reset de senha sem enumeração de contas;
- plugin de dois fatores (TOTP), exigido nas rotas `/admin`;
- rate limit embutido nas rotas de autenticação;
- hash da senha com **Argon2id** (`@node-rs/argon2`) no lugar do scrypt padrão, como pede o blueprint.

**Sobre "a senha não é armazenada pela aplicação":** a senha em texto nunca é gravada nem logada. Fica só o hash Argon2id, isolado nas tabelas do módulo de autenticação, que nenhuma outra parte do código consulta. Se for exigência jurídica tirar até o hash da nossa infraestrutura, a troca por um provedor OIDC externo fica restrita a `apps/web/src/lib/auth`.

## Consequências
- O e-mail transacional passa pela interface `MailProvider`: em desenvolvimento só registra no log, em produção usa o Resend. A troca de fornecedor é uma implementação nova da interface.
- Login social (Google) pode entrar depois como provedor do Better Auth, sem mudar o schema.
