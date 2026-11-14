# ADR 0014: Busca por texto e por conceito

- Status: aceito (Fernando, 13/11/2026)
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

## Escolha do provedor (14/11/2026)

Fernando escolheu a **Voyage AI** (SPEC v2, D21). Implementação do item 66:
- Modelo `voyage-4`, 1024 dimensões, `input_type` `document` para os trechos e `query` para as buscas (API conferida em docs.voyageai.com em 14/11/2026). Preço: US$ 0,06 por milhão de tokens, com 200 milhões grátis por conta. Retenção zero e sem uso para treino: opção "Opted Out" no painel (Organization → Terms of Service), que pede cartão cadastrado.
- Trechos de cerca de **350 palavras** com 50 de sobreposição, em vez de 800: slides têm pouco texto por página, e trecho grande tornaria a página de origem imprecisa. Reavaliar com a bateria real.
- `material_chunks` com RLS (migrations 0051 e 0052) e índice HNSW por cosseno. A extensão `vector` é criada por superusuário (`docs/deploy.md`).
- O worker gera os vetores por aluno (`ai.embed_user`), quando o arquivo fica pronto, quando entra material ou versão e quando o aluno autoriza. Apaga os trechos de versão antiga, de material na lixeira e de quem retira a autorização.
- **Autorização:** o texto da leitura dos materiais passou a citar a Voyage AI (política na versão `2026-11-14-rascunho`). Só gera vetores quem autorizou a partir dessa versão; quem autorizou antes continua com a busca por palavra e vê, na busca, o pedido para autorizar.
- Busca híbrida por fusão de posições (RRF, k = 60) entre a busca por palavra e os trechos com semelhança de cosseno a partir de 0,3 (ajustar com a bateria). O tutor sobre os materiais usa a mesma fusão para escolher as páginas quando o material passa do teto.
- Interruptor "Busca por conceito" no `/admin/ia`; custo em `ai_usage` (`embedding` e `embedding_query`). Sem `VOYAGE_API_KEY`, só a busca por palavra.

## Consequências

- Nenhum serviço novo para operar, e o backup do Postgres já cobre os índices.
- O banco cresce com os vetores. Ordem de grandeza: um PDF de 50 páginas gera cerca de 20 trechos, e cada vetor ocupa alguns KB. Reavaliar com uso real.
- Se a busca por conceito precisar de mais desempenho do que o Postgres dá, a troca fica restrita ao serviço de busca, sem mexer no resto.
- Gerar vetores tem custo de IA por arquivo, registrado em `ai_usage` com o recurso `embedding`.
