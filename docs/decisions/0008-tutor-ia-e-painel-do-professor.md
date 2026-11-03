# ADR 0008: Tutor IA e painel do professor

- Status: aceito
- Data: 2026-11-03

## Contexto

O Fernando pediu, para o ciclo 2, o painel do professor (roadmap F2) e o tutor IA (SPEC M3, roadmap F1), junto com o admin da empresa. Os dois mexem com dado de aprendizagem do aluno, e o tutor tem custo por uso e risco de resposta clínica ou inventada.

## Decisão: painel do professor

- **Turma com código.** O professor cria a turma; o aluno entra pelo código no perfil, depois de ler o que o professor vai ver. Sair encerra o compartilhamento na hora.
- **Só agregados, só depois da entrada.** O professor nunca lê `question_attempts` direto. As funções `class_student_stats`, `class_topic_stats` e `class_missed_questions` (`SECURITY DEFINER`, migration 0011) conferem se a turma é dele, consideram só os alunos ainda na turma e contam só o que eles fizeram depois de entrar.
- **Sem lista de alunos sem consentimento.** Não existe "importar a turma": cada aluno entra por conta própria. Entrar e sair são registrados na auditoria.
- **Quem precisa de atenção** usa uma regra simples e explicável: parado há 7 dias, ou acertando menos da metade com 5 ou mais respostas na semana.

## Decisão: tutor IA

- **Provedor atrás de interface (`AIProvider`)**, com uma implementação Anthropic e uma de teste (`AI_PROVIDER=fake`, usada no CI e no E2E, sem chave e sem custo).
- **Modelo `claude-opus-5-5` com esforço `low`**, que basta para uma conversa curta de estudo. O modelo pode ser trocado por `TUTOR_MODEL`, sem deploy de código.
- **Fallback do servidor ligado** (`fallbacks: "default"`): se o classificador recusar, outro modelo responde em vez de o aluno ficar sem resposta. As recusas ficam registradas.
- **Contexto restrito ("RAG" sem busca vetorial).** Vão ao modelo:
  - o resumo **publicado** do módulo;
  - as explicações das questões que **o próprio aluno já respondeu** naquele assunto. O gabarito não vaza antes da tentativa, regra que o teste de integração cobre.

  Busca textual ou `pgvector` ficam para quando o volume de material passar do que cabe no contexto.

- **Cache.** As regras e o material do módulo, que são iguais para todos, vão primeiro e ficam em cache. As questões do aluno vêm depois.
- **Regras no prompt:**
  - usar só o material e dizer quando ele não cobre a dúvida;
  - avisar quando o material é de demonstração;
  - não orientar caso real;
  - não entregar gabarito;
  - tratar o conteúdo como texto, não como instrução.
- **Cota e custo.** A cota é de N perguntas por aluno em 24 horas (`TUTOR_DAILY_LIMIT`, e o admin pode mudar). Cada resposta grava modelo, tokens e custo estimado (`tutor_messages`, só inserção). O admin vê uso, custo, recusas e conversas (abrir uma conversa fica na auditoria) e pode desligar o tutor.
- **Transparência e LGPD.** O aluno é avisado de que a conversa fica guardada e pode ser revista. As conversas entram na exportação de dados.
- **Avaliação.** 30 casos (SPEC §12.3) em `src/features/tutor/eval/cases.ts`, com checagem por regra:
  - material;
  - fora do material;
  - caso real;
  - gabarito;
  - injeção;
  - citação inventada.

  Roda com `pnpm --filter @gutta/web tutor:eval` e custa cerca de US$ 0,50 por rodada.

## Consequências

- Sem `ANTHROPIC_API_KEY` em produção, o tutor aparece como desligado. O resto do app segue normal.
- O custo por aluno depende do uso. A estimativa inicial é de cerca de US$ 0,015 por pergunta, com material de ~1,5 mil tokens e resposta de ~400.
- A bateria de avaliação precisa rodar antes de abrir o tutor para a turma piloto, e de novo a cada troca de modelo ou de prompt.
