# Relatório de impacto (RIPD): rascunho

Rascunho técnico para a revisão jurídica (art. 38; SPEC §13.1 pede avaliar a necessidade antes de operar em escala). Não substitui o parecer.

## Escopo

Plataforma de estudo para graduação em saúde: conta, personalização do estudo, turmas com professor e tutor IA.

## Por que pode ser exigido

- Dados de desempenho acadêmico em volume, com perfilamento (recomendação do próximo passo).
- Tratamento por IA com transferência internacional (tutor).
- Público jovem, possivelmente com menores de 18 anos.

## Riscos e medidas

| Risco                                       | Probabilidade | Impacto | Medidas em vigor                                                                                   |
| ------------------------------------------- | ------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Um aluno ver dados de outro                 | baixa         | alto    | RLS com FORCE em toda tabela do aluno, papel `gutta_app` sem BYPASSRLS, testes de isolamento no CI |
| Professor ver mais do que o aluno autorizou | baixa         | médio   | só agregados, só após a entrada, só alunos ainda na turma (funções `class_*`)                      |
| Faculdade receber dado individual           | baixa         | alto    | não existe tela nem API para isso; indicadores institucionais pendentes de base legal              |
| Pergunta ao tutor com dado de paciente      | média         | alto    | aviso antes do aceite e no formulário; regra no prompt; termos proíbem                             |
| Envio à Anthropic sem base legal            | baixa         | médio   | consentimento específico (`ai_tutor`) checado no servidor antes de gravar ou enviar                |
| Retenção além do necessário                 | média         | médio   | prazos por categoria e limpeza automática                                                          |
| Exclusão pedida e não feita                 | baixa         | médio   | execução automática no fim do prazo; fila com prazo para o admin                                   |
| Vazamento por log                           | baixa         | médio   | e-mail mascarado; corpo de e-mail fora do log em produção                                          |
| Acesso indevido de administrador            | baixa         | alto    | 2FA obrigatório, auditoria das ações, leitura de conversa do tutor auditada                        |

## Riscos residuais

Ver "Pendências" em [README](README.md).
