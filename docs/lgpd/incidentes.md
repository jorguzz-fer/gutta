# Plano de resposta a incidentes de segurança com dados pessoais

Base: LGPD art. 48 e regulamento da ANPD sobre comunicação de incidentes. Rascunho operacional; prazos e modelo de comunicação a confirmar na revisão jurídica.

## 1. Detectar e registrar

- Qualquer pessoa do time que suspeitar de incidente avisa o encarregado e o responsável técnico no mesmo dia.
- Abrir um registro com: data e hora, como foi descoberto, dados e titulares possivelmente afetados, sistemas envolvidos.

## 2. Conter (primeiras horas)

- Revogar credenciais expostas: token do Coolify, `BETTER_AUTH_SECRET` (derruba todas as sessões), senhas dos papéis do Postgres, chaves da Anthropic e do Resend.
- Encerrar sessões de contas suspeitas em `/admin/usuarios` → Encerrar sessões.
- Desligar o tutor em `/admin/tutor` se o vetor for a IA.
- Preservar logs e a tabela `audit_logs` (não rodar a limpeza de retenção durante a investigação).

## 3. Avaliar

- Quais dados (conta, desempenho, conversas do tutor), quantos titulares, se há risco ou dano relevante.

## 4. Comunicar

- Se houver risco ou dano relevante: comunicar a ANPD e os titulares afetados no prazo do regulamento vigente, com: descrição, dados afetados, medidas tomadas, riscos e contato do encarregado.
- Titulares: e-mail (quando o Resend estiver ativo) e aviso no app.

## 5. Corrigir e aprender

- Corrigir a causa, adicionar teste que cubra o caso e registrar a lição em `docs/decisions/` se mudar arquitetura.
