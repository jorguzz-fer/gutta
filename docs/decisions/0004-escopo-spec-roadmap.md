# ADR 0004: Escopo, quando a SPEC e o roadmap divergem

- Status: aceito
- Data: 2026-11-02

## Contexto
A SPEC v1 deriva do documento de conceito. O roadmap v2 (02/11/2026, `public/roadmap`) é o plano acordado entre os quatro sócios e corta escopo de propósito.

## Decisão
- Para **escopo e prioridade**, vale o roadmap:
  - um curso (Medicina) e uma trilha (cardiovascular, a partir da aula de MCH);
  - "módulo padrão" = aula interativa + questões comentadas + flashcards + resumo + tutor;
  - e-mail no domínio próprio fica fora do MVP;
  - o canal com o aluno é o WhatsApp (F2).
- Para **engenharia** (dados, segurança, RLS, idempotência, testes, DoD), vale a SPEC e o blueprint.
- O schema já suporta vários cursos (SPEC CAT-01), mas o conteúdo e a interface são de um curso só.
- O tutor IA fica para depois de a fundação estar testada (SPEC §19.2), embora o roadmap o coloque na F1. A ordem dentro da F1 é: fundação, depois questões e flashcards, depois o tutor.
- Identidade digital (SPEC ID-01) não entra neste ciclo.

## Consequências
Quando o roadmap mudar, este ADR é revisto. Funcionalidades cortadas continuam listadas em `docs/plano-de-execucao.md`, em "Fora deste ciclo".
