# ADR 0005: Conteúdo de demonstração

- Status: aceito
- Data: 2026-11-02

## Contexto
A SPEC exige seeds com curso, disciplinas, assuntos, questões e resumos, e proíbe apresentar dados de demonstração como conteúdo médico validado. A revisão científica é do Hugo Orsini, e ainda não existe conteúdo revisado na plataforma.

## Decisão
- Todo item editorial tem a coluna `is_demo`, e o seed grava `is_demo = true`.
- A interface mostra o selo "Demonstração · sem revisão editorial" em todo item com `is_demo`.
- O seed não traz citações bibliográficas. A fonte fica vazia, e a interface diz "sem referência cadastrada" em vez de inventar uma.
- Instituições do seed são marcadas como exemplo.
- O seed não roda em produção: o script se recusa a rodar quando `NODE_ENV=production`, a menos que se passe `SEED_ALLOW_PRODUCTION=1`.

## Consequências
Antes do teste de corredor, o conteúdo do módulo MCH tem que ser cadastrado pelo fluxo editorial e revisado pelo Hugo. Só esse conteúdo sai sem o selo.
