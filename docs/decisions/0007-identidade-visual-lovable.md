# ADR 0007: Identidade visual do protótipo do Lovable

- Status: aceito
- Data: 2026-11-03

## Contexto

O Fernando montou no Lovable um protótipo de telas do Gutta e subiu o código (`Gutta-projeto.zip`, na raiz do repositório). O pedido foi: "quero esse layout e design". O protótipo é outra base técnica (TanStack Start, shadcn/ui, sem autenticação nem dados reais) e traz telas e números de demonstração.

## Decisão

Adotamos o **visual e o layout** do protótipo na plataforma existente. A base técnica não muda.

- **Tema e cor.** Escuro por padrão, com botão para o claro, que fica guardado no navegador. Vermelho como cor da marca (`oklch(0.72 0.18 27)` no escuro, `oklch(0.52 0.2 27)` no claro). Tudo isso está em `apps/web/src/styles/tokens.css`.
- **Tipografia.** Archivo Black nos títulos e Hind no texto, servidas pelo app (OFL; ver `src/fonts/LICENSE.md`). Rótulos em caixa alta e espaçados.
- **Componentes.** Cantos retos (6 px) e botões sem pílula. A marca vira o texto "GUTTA" em vermelho.
  - Disciplinas e módulos aparecem como **capas** em degradê, nos tons de vermelho (`components/shared/cover.tsx`).
  - Landing com capa (coração) e fileira "Como funciona". Login e cadastro em tela dividida, com o painel da marca.
  - Painel com indicadores no topo e módulo com a aula em destaque, o resumo e um quadro "Depois da aula".
- **Imagens do protótipo** em `apps/web/public/img`: capa e ilustrações das aulas.

O que **não** veio do protótipo, de propósito:

- Números e afirmações inventados: "32 aulas", "Série original", ranking da turma, recorde de sequência, "casos clínicos reais". Os indicadores do painel mostram só dados reais do aluno (SPEC: personalização verificável; ADR 0005).
- Telas fora do MVP pelo roadmap: marketplace, e-mail Gutta, batalha, comunidades, instituição.
- O tutor de IA do protótipo, que usa o AI Gateway do Lovable. O tutor segue o plano da SPEC (M3).
- Conteúdo sem selo: o protótipo não marca nada como demonstração, e aqui o selo "Demonstração · sem revisão" continua em todo item que não passou pelo editorial.

## Consequências

- Contraste revisado com axe (WCAG 2.2 AA) nos dois temas, e o E2E continua passando.
- A cor de erro fica próxima da cor da marca. Por isso o erro sempre vem com ícone e texto, nunca só com cor.
- O visual experimental de vidro (`data-look="glass"`) foi refeito nos tons de vermelho e segue opcional.
- Quem já usava o tema claro do sistema passa a ver o escuro, até escolher o claro no botão do topo.
