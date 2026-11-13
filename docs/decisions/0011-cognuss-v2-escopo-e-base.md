# ADR 0011: Cognuss v2, nova fonte de verdade de produto sobre a base do MVP

- Status: aceito (Fernando, 13/11/2026, junto com a aprovação da SPEC v2)
- Data: 2026-11-13

## Contexto

O Dr. Hugo e o Dr. Rafael entregaram em 12/11/2026 o documento _COGNUSS: Proposta de Interface e Especificação Funcional, Parte I_. Ele muda o centro do produto: do conteúdo curado pela plataforma (MVP Gutta, SPEC v1 e roadmap v2) para a vida acadêmica real do aluno, com as disciplinas, os cronogramas, a rotina, as faltas, as notas e os materiais dele.

O Fernando pediu uma nova versão a partir desse documento e trouxe este repositório porque ele é o MVP.

O ADR 0004 dizia que, em conflito de escopo, vale o roadmap público. O roadmap ainda descreve um curso e uma trilha, e não cobre o que o documento novo pede.

## Opções consideradas

1. **Repositório novo, do zero.** Liberdade total de desenho. Contra: refazer autenticação, RLS, LGPD, admin, camada de IA, CI, E2E e teste de carga, que estão prontos e testados e que a v2 usa sem mudança.
2. **Manter a SPEC v1 e encaixar o documento como funcionalidades extras.** Contra: a v1 parte do catálogo editorial; o documento novo parte do semestre do aluno. Encaixar deixaria dois modelos de disciplina e duas telas iniciais convivendo.
3. **Evoluir este repositório, com uma SPEC v2 como fonte de verdade de produto.**

## Decisão

Opção 3.

- `docs/spec/SPEC_Cognuss_v2.md` passa a ser a fonte de verdade de **produto e escopo**.
- A SPEC v1 e o `Engineering_Blueprint.md` continuam valendo para **padrão de engenharia**. A seção 7.2 da SPEC v2 mostra a conformidade com o blueprint, item a item.
- Enquanto o roadmap público não for atualizado, em conflito de escopo vale a SPEC v2. Isso substitui a regra do ADR 0004. `public/` só muda a pedido.
- O que o MVP construiu é a fundação da v2 (SPEC v2, 7.1). Onboarding, painel "Hoje", `student_disciplines` e `exam_dates` são substituídos; o catálogo editorial vira o acervo de material complementar.
- Cada componente novo de infraestrutura (armazenamento, fila, busca, anotações, notificações, offline, áudio, contrato) ganha um ADR próprio, do 0012 ao 0019, antes de ser construído.
- Nada da v2 começa antes de fecharem as decisões que bloqueiam o início na SPEC v2 (seção 14). Em 13/11/2026 o Fernando fechou as sete (D01 a D07).

## Consequências

- Os ADRs 0001, 0002, 0003, 0005, 0006, 0008 e 0009 seguem valendo. O 0004 fica substituído neste ponto. O 0007 e o 0010 seguem valendo: o app continua escuro e vermelho (decisão D03, Fernando, 13/11/2026). O recorte de um curso só, do 0004, cai: a v2 atende qualquer curso da saúde (D05).
- O repositório ganha um processo `worker`, Redis e um bucket de arquivos. A operação fica maior: backup e exclusão LGPD passam a cobrir arquivos.
- O custo por aluno deixa de ser só o do tutor: extração, geração e busca usam IA. Precisa ser medido antes de fixar limites.
- O documento de origem é a Parte I. Menu principal, simulados e outras áreas ficam abertos até a Parte II.
