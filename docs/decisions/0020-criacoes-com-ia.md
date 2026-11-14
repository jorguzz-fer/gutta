# ADR 0020: Criações com IA e rastreabilidade

- Status: proposto
- Data: 2026-11-14

## Contexto

A Ajuda Cognuss (SPEC v2, 5.14) transforma o material do aluno em resumos, flashcards, questões, mapas e roteiros, e ganha um tutor que usa os documentos escolhidos. As regras IA-1 a IA-9 exigem: usar primeiro as fontes escolhidas, identificar arquivo e página de cada trecho, separar o que não está no material, não inventar, tratar o arquivo como dado e marcar tudo como gerado por IA. A busca por conceito (vetores, ADR 0014) ainda não tem provedor escolhido.

## Decisão

**Onde roda.** Toda geração é um trabalho na fila (`ai_jobs`, ADR 0013), com estado visível ao aluno e cancelamento. O servidor web só enfileira; o worker chama o provedor pela interface do `packages/ai`, com uma implementação Anthropic e uma de teste (`AI_PROVIDER=fake`), como na extração do cronograma.

**Contexto e fontes.** O material vai ao modelo como páginas numeradas, cada uma com uma etiqueta curta (`P1`, `P2`…) que o servidor mapeia para material, versão e página. Antes da busca por conceito, a seleção é: as páginas dos materiais escolhidos, na ordem, até um teto de tamanho; acima dele, as páginas que mais combinam com o tema e as instruções pela busca por palavra (ADR 0014), avisando o aluno do corte. As páginas vão num bloco de dados separado das instruções.

**Saída validada.** A resposta vem em formato de esquema (saída estruturada do SDK). Cada trecho cita as etiquetas que usou; etiqueta que não existe ou criação sem nenhuma fonte é descartada e a geração falha com uma mensagem clara (nunca mostrada pela metade). Conteúdo que não está no material vem num campo próprio ("complemento"), mostrado separado e com rótulo (IA-3).

**Guarda.** `creations` guarda o conteúdo em jsonb e `creation_sources` as páginas usadas (material, versão, páginas), sob RLS. Toda criação mostra o selo "Gerado por IA a partir dos seus materiais · sem revisão editorial" (IA-8). Quando entra material novo no mesmo tema ou disciplina, as criações ligadas ficam marcadas como desatualizadas (AJU-11).

**Questões e flashcards.** Flashcards gerados entram na revisão espaçada do MVP como cartões pessoais (MEM-01). Questões geradas ficam em tabela privada própria, com o gabarito e o comentário só no servidor; a tentativa é corrigida no servidor e só então o comentário vai ao navegador (MEM-03, IA-9). Não reaproveitamos a tabela editorial de questões do MVP, que é ligada ao catálogo e tem fluxo de publicação; o motor de tentativa segue o mesmo desenho.

**Análise de provas (MAT-11, MAT-12).** É mais um tipo de criação (`analise`), só sobre materiais do tipo prova ou atividade. O modelo lista temas, formatos, competências e sugestões de revisão, cada item com todas as páginas em que aparece; a frequência ("em X de N documentos") é contada no worker pelos documentos dessas páginas, nunca estimada pelo modelo. Toda análise mostra o total de documentos e o aviso de que frequência passada não garante cobrança futura.

**Tutor sobre os materiais (AJU-08, AUL-17).** Conversa com fonte escolhida (materiais, aula ou slide), sem fila: a resposta é curta e o aluno espera por ela. Mesmo desenho de páginas etiquetadas; o servidor tira da resposta qualquer etiqueta que não exista e guarda as páginas citadas com a mensagem. Acima do teto de tamanho, ficam as páginas mais ligadas à pergunta pela busca por palavra.

**Custo.** Cada chamada grava modelo, tokens e custo em `ai_usage`, por aluno e por recurso. Sem teto durante o QA (D07); o admin vê o gasto, recebe alerta acima de um valor configurável e desliga cada recurso.

## Consequências

- Rastreabilidade por página sem depender do recurso de citações da API, que não combina com saída estruturada.
- Material grande demais é cortado com aviso, até a busca por conceito existir.
- A bateria de avaliação ganha casos de fidelidade, citação de página, recusa e injeção; ela só roda com a chave da API.
