# LGPD no Gutta: mapa e registro das operações

Registro das operações de tratamento (art. 37) em formato de trabalho. Rascunho para a revisão jurídica (D09). Decisões técnicas no [ADR 0009](../decisions/0009-lgpd.md).

## Papéis

- **Controlador:** `LEGAL_CONTROLLER_NAME` / `LEGAL_CONTROLLER_DOCUMENT` (a definir).
- **Encarregado (DPO):** `DPO_NAME` / `DPO_EMAIL` (a definir). Canal no app: `/app/privacidade` → pedidos.
- **Operadores:** provedor de infraestrutura (servidor do Coolify e Postgres); Anthropic (tutor IA, EUA); Resend (e-mail transacional, EUA, quando `RESEND_API_KEY` estiver definida).
- **Terceiro no navegador:** site das aulas interativas (`LESSON_ORIGINS`), que recebe IP e navegador ao carregar o iframe.

## Operações de tratamento

| Operação                | Dados                                                     | Titulares           | Base legal (art. 7º)                                     | Onde                                                                     | Retenção                                               |
| ----------------------- | --------------------------------------------------------- | ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| Conta e autenticação    | nome, e-mail, hash da senha, 2FA, sessões (IP, navegador) | todos               | V (contrato)                                             | `auth_*`                                                                 | enquanto a conta existir; sessões até vencer           |
| Perfil acadêmico        | curso, instituição, semestre, disciplinas, provas         | alunos              | V                                                        | `student_profiles`, `student_disciplines`, `exam_dates`                  | enquanto a conta existir                               |
| Estudo e personalização | sessões, respostas, domínio, recomendações, flashcards    | alunos              | V                                                        | `question_*`, `topic_mastery`, `flashcard_*`, `learning_recommendations` | enquanto a conta existir                               |
| Turmas                  | vínculo aluno-turma, agregados para o professor           | alunos, professores | I (consentimento ao entrar)                              | `classes`, `class_members`, funções `class_*`                            | até sair da turma ou excluir a conta                   |
| Tutor IA                | pergunta, resposta, resumo do desempenho no módulo        | alunos              | I + art. 33, VIII (consentimento específico, `ai_tutor`) | `tutor_*`; envio à Anthropic                                             | texto: `tutorDays` (365); contagem de uso: com a conta |
| Marketing               | e-mail                                                    | alunos              | I (`marketing`)                                          | `consent_records`                                                        | até retirar                                            |
| Consentimentos          | finalidade, versão, data                                  | todos               | II e VI (prova do consentimento)                         | `consent_records`                                                        | com a conta                                            |
| Pedidos do titular      | tipo, descrição, resposta                                 | todos               | II (art. 18 e 19)                                        | `data_requests`                                                          | com a conta                                            |
| Auditoria e segurança   | quem fez o quê, ids                                       | todos               | IX (legítimo interesse) e VI                             | `audit_logs`                                                             | `auditDays` (1825)                                     |
| Métricas do produto     | eventos de uso por id                                     | alunos              | IX                                                       | `product_events`                                                         | `eventsDays` (730); anônimos após exclusão             |

## Direitos do titular (art. 18) no produto

| Direito                            | Como                                              | Prazo                     |
| ---------------------------------- | ------------------------------------------------- | ------------------------- |
| Confirmação e acesso               | `/app/privacidade` → Baixar meus dados (JSON)     | imediato                  |
| Correção                           | Perfil (direto) ou pedido "Corrigir dados"        | 15 dias                   |
| Anonimização, bloqueio, eliminação | pedido de exclusão; apagar texto do tutor         | até 15 dias (desistência) |
| Portabilidade                      | mesmo JSON                                        | imediato                  |
| Informação sobre compartilhamento  | política + pedido "Saber com quem compartilhamos" | 15 dias                   |
| Revogação do consentimento         | botões em Privacidade; sair da turma em Perfil    | imediato                  |
| Oposição e revisão                 | pedido "Me opor a um uso ou pedir revisão"        | 15 dias                   |

## Operação

- **Fila:** `/admin/privacidade`, pedido mais antigo primeiro, com o prazo de 15 dias.
- **Retenção:** roda no start do container e em `/admin/privacidade` → "Rodar limpeza agora". Em produção, configure a tarefa agendada diária (ver `docs/deploy.md`).
- **Incidentes:** [plano de resposta](incidentes.md).
- **RIPD:** [rascunho](ripd-rascunho.md).

## Pendências para a revisão jurídica

1. Dados do controlador e do encarregado.
2. Confirmar prazos de retenção e se registros de acesso (IP das sessões) precisam ser guardados por 6 meses (Marco Civil, art. 15). Hoje somem quando a sessão vence ou a conta é excluída.
3. Garantias de transferência internacional para infraestrutura e e-mail (art. 33): cláusulas contratuais com Resend e com o provedor de infraestrutura.
4. Contratos de operador (DPA) com Anthropic, Resend e infraestrutura.
5. Regra para menores de 18 anos (art. 14).
6. Consentimento de pesquisa, se o piloto gerar publicação (roadmap R).
7. Indicadores institucionais agregados: grupo mínimo e base legal antes de existir qualquer relatório para faculdades.
