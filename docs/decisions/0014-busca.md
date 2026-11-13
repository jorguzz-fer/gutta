# ADR 0014: Busca por texto e por conceito

- Status: proposto
- Data: 2026-11-13

## Contexto

A SPEC v2 pede dois tipos de busca no Material de Estudo (MAT-09):
- **por palavra** no título e no conteúdo dos arquivos, das anotações e dos lembretes;
- **por conceito**: "inflamação crônica" deve achar slides, anotações e provas relacionados, mesmo sem o termo exato.

A camada de IA precisa recuperar os trechos certos dos materiais do aluno para resumir, gerar questões e responder no tutor, sempre com a página de origem (regras IA-1 e IA-2).

Regra que não muda: um aluno nunca encontra material de outro (ADR 0003). Hoje o tutor do MVP não faz busca; manda o resumo inteiro do módulo (ADR 0008).

## Opções consideradas

1. **Motor de busca separado** (Elasticsearch, Meilisearch, Typesense). Busca mais rica. Contra: mais um serviço com cópia dos dados do aluno, sem o RLS; o isolamento passaria a depender só de filtro no código.
2. **Banco vetorial gerenciado.** Contra: mais um operador fora do país, com o conteúdo dos materiais.
3. **Tudo no Postgres:** texto completo em português (`tsvector`) e vetores com a extensão `pgvector`, nas mesmas tabelas, sob o mesmo RLS.

## Decisão

Opção 3.

**Busca por palavra (Fase 3)**
- Coluna `search tsvector` gerada em `material_pages`, `notebook_entries`, `materials` (título) e `reminders`, com o dicionário `portuguese` e `unaccent` ("inflamacao" acha "inflamação").
- Índice GIN em cada uma.
- Resultado ordenado por `ts_rank`, com filtros por disciplina, semestre, tipo, professor e data. O trecho encontrado é destacado com `ts_headline`.

**Busca por conceito (Fase 5)**
- `material_chunks`: trechos de cerca de 800 palavras, com sobreposição, guardando `page_from` e `page_to`. Coluna `embedding vector(N)` com índice HNSW. A dimensão N depende do modelo escolhido.
- Busca híbrida: o resultado combina a ordem por palavra e a ordem por vetor (fusão por posição), o que funciona melhor que qualquer um sozinho para termos médicos.
- O modelo de vetores é escolhido na Fase 5, pelo `AIProvider`, medindo acerto em português com material real. Isso inclui escolher um provedor que aceite contrato sem retenção dos dados.

**Isolamento**
- `material_pages`, `material_chunks` e `notebook_entries` têm `owner_id`, RLS com `FORCE` e a política padrão.
- Toda busca, inclusive a feita pela IA, roda dentro de `withUser()`. O filtro `owner_id = $1` também vai explícito na consulta, como no resto do código.
- Teste de integração por tipo de busca: o aluno B procura um termo que só existe no material do aluno A e não recebe nada.

**Extensões no Postgres**
- `pgvector` e `unaccent`.
- Atenção: a imagem atual é `postgres:16-alpine`. Trocar para uma imagem baseada em Debian (como a oficial do pgvector) muda a biblioteca C, e a ordenação de texto pode mudar com ela, o que corromperia índices de texto já existentes em produção. Por isso a extensão é **compilada dentro da imagem Alpine atual** (`infra/postgres/Dockerfile`), sem trocar a base.
- A migration cria as extensões como `gutta_owner`. O papel `gutta_app` não ganha permissão nova.

## Consequências

- Nenhum serviço novo para operar, e o backup do Postgres já cobre os índices.
- O banco cresce com os vetores. Ordem de grandeza: um PDF de 50 páginas gera cerca de 20 trechos, e cada vetor ocupa alguns KB. Reavaliar com uso real.
- Se a busca por conceito precisar de mais desempenho do que o Postgres dá, a troca fica restrita ao serviço de busca, sem mexer no resto.
- Gerar vetores tem custo de IA por arquivo, registrado em `ai_usage` com o recurso `embedding`.
