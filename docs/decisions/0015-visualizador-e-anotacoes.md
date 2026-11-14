# ADR 0015: Visualizador de slides e anotações

- Status: proposto (aguarda o Fernando e o resultado do experimento da caneta, item 36)
- Data: 2026-11-14

## Contexto

O Acompanhar Aula (SPEC v2, 5.7) transforma os slides do professor num caderno: o aluno vê o
PDF, desenha por cima com mouse, dedo ou caneta, escreve no caderno ao lado de cada slide e marca
importância, dificuldade e dúvidas. Requisitos que pesam na escolha:

- O PDF do professor nunca muda (AUL-06); as marcações são uma camada à parte, do aluno (AUL-25).
- Funciona no Safari do iPad e no Chrome do Android, com pressão quando o aparelho informa (AUL-05).
- O traço não espera o servidor (SPEC v2, 9: "sem atraso perceptível").
- Começar no notebook e continuar no tablet (AUL-26).
- As anotações sobrevivem à troca de versão do arquivo (AUL-25).

O experimento da caneta (item 36) mede o que cada aparelho entrega e ainda não foi rodado; a
construção do AUL segue antes dele. Esta decisão escolhe o que não depende do experimento e deixa
ajustável o que depende dele (espessura por pressão, rejeição da palma).

## Opções consideradas

1. **Imagens das páginas geradas no worker**, com a camada por cima. Simples e igual em todo
   navegador. Contra: zoom perde nitidez; uma imagem grande por página no bucket.
2. **pdf.js no navegador**, desenhando cada página num `canvas` na resolução da tela, com a
   camada de marcações em SVG por cima. Zoom nítido; o PDF vem do bucket por URL assinada.
3. **Biblioteca de quadro branco pronta** (tldraw, Excalidraw) por cima do PDF. Muitas
   ferramentas prontas. Contra: modelo de dados da biblioteca, licença e peso; difícil guardar por
   página com coordenadas normalizadas.

## Decisão

Opção 2, como a SPEC v2 (7.1) previa.

**Exibição**
- `pdfjs-dist`, com o worker do pdf.js servido pelo próprio app (`script-src 'self'`) e
  `isEvalSupported: false`. A CSP ganha `'wasm-unsafe-eval'` para os decodificadores de imagem
  do pdf.js; continua sem `'unsafe-eval'`.
- O PDF vem da URL assinada do arquivo (o original, ou o PDF convertido do PowerPoint). O CORS do
  bucket já aceita `GET` a partir do app (`docs/deploy.md`).
- Miniaturas: as que o worker já gera (320 px).

**Camada de marcações**
- Um documento por `(aluno, versão do material, página)` em `slide_annotations.layer` (jsonb):
  lista de formas (traço de caneta com pressão por ponto, marca-texto, linha, seta, elipse,
  retângulo, caixa de texto, imagem), com cor, espessura e **coordenadas normalizadas de 0 a 1**
  em relação à página, independentes do zoom e do aparelho.
- Desenhada em SVG por cima do canvas. Eventos de ponteiro (`pointerdown/move/up`), com os pontos
  agrupados (`getCoalescedEvents`) quando o navegador oferece. Enquanto a caneta está em uso, toque
  de dedo não desenha (palma apoiada); o dedo rola a página.
- Esquema validado no servidor (tipos de forma, cores `#rrggbb`, limites de pontos e de formas por
  página); a camada nunca é interpretada como HTML.

**Salvamento e conflito**
- Salvamento automático por página, alguns segundos depois do último traço, com indicação de
  "salvo" (AUL-07). Cada gravação manda a revisão em que se baseou.
- Vence a última gravação. Se a revisão base não for a atual (outro aparelho gravou antes), a
  versão substituída vai para `slide_annotation_history`, e nada some. Também guardamos uma cópia
  a cada 10 minutos de edição, para o histórico com recuperação (AUL-12). Ficam as 50 últimas.
- Gravar a mesma camada de novo não muda nada (repetição segura).

**Caderno**
- `notebook_entries` por aula e slide, com texto que cresce conforme se escreve. Formatação
  leve, escrita como texto: listas (`- ` e `1. `), tabelas (`| a | b |`), negrito (`**`) e
  fórmulas com KaTeX (`$...$` e `$$...$$`, sem `trust`). O texto é transformado em elementos
  React por um analisador próprio (`packages/core`), nunca injetado como HTML; só a saída do
  KaTeX entra como HTML, gerada pela própria biblioteca.
- Busca por palavra no caderno com a mesma configuração `cognuss_pt` (ADR 0014).

**Troca de versão (AUL-25)**
- As anotações ficam ligadas à versão em que foram feitas. Quando o material ganha versão nova,
  a plataforma compara o texto de cada página antiga com as novas (função pura em
  `packages/core`) e sugere o par mais parecido. O aluno confirma; só então a camada e as notas
  passam para a versão nova. Sem par, ficam em "páginas da versão anterior".
- A comparação roda no servidor web na hora em que o aluno abre a sugestão: é texto já extraído,
  rápido. Se ficar lento com arquivos grandes, passa para o worker.

## Consequências

- Uma dependência nova no navegador (`pdfjs-dist`, carregada só na tela da aula) e uma para
  fórmulas (`katex`).
- O traço é desenhado localmente; o servidor só recebe a camada pronta. A espessura por pressão e
  a rejeição da palma são ajustadas com os números do experimento da caneta (item 36).
- Exportar o PDF anotado (AUL-24) e o funcionamento offline (AUL-27, D12) ficam para depois; o
  formato da camada já permite os dois.
