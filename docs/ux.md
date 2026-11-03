# UX do Gutta: decisões e revisão (leis de UX)

Contexto: estudante de graduação em saúde, no celular, entre uma aula e outra. A tarefa principal é chegar ao próximo passo de estudo e cumpri-lo em poucos minutos: resolver questões, entender o erro e revisar no dia certo. O resultado que importa para o negócio é o hábito diário (WALS, retenção D7).

## Decisões de UX por tela

**Landing**

- Uma promessa e um único botão primário, "Criar conta grátis" (Hick, Von Restorff).
- "Entrar" fica no canto superior direito, onde se espera (Jakob).
- "Leva cerca de 2 minutos" ao lado do botão (Parkinson).

**Cadastro**

- Só 3 campos e o aceite; curso, semestre e disciplinas ficam para o onboarding (Hick, Postel).
- O e-mail aceita espaços e maiúsculas e é normalizado no servidor (Postel).
- Os erros dizem o que fazer ("falta algo como nome@exemplo.com"), não só "inválido".
- Marketing é um consentimento separado e desmarcado.

**Onboarding**

- 3 passos com barra de progresso e nome de cada passo (Gradiente de Meta, Conexão Uniforme).
- Padrões sensatos já marcados: curso único, meta de 20 min e dias úteis (Tesler). A prova é opcional.
- "Do seu semestre" aparece ao lado da disciplina (Proximidade).
- O erro de um campo some assim que ele é corrigido (validação inline, Doherty).
- O fim leva a um painel com boas-vindas e o primeiro passo (Pico-Fim).

**Painel "Hoje"**

- Um único botão primário: a próxima ação, com o motivo logo abaixo (Von Restorff). Personalização verificável, como pede a SPEC.
- Blocos na ordem de prioridade da SPEC (Posição Serial): próxima ação, questão do dia, disciplinas, revisões, semana e provas.
- Tempo estimado em cada ação, para o aluno decidir se cabe agora (Parkinson).
- Domínio aparece em faixas ("Sem diagnóstico", "Frágil", "Firme"), sem porcentagem enquanto houver poucos dados.
- A semana mostra os dias estudados sem punir o dia perdido. Nada de streak que zera (Zeigarnik usado com cuidado, sem dark pattern).

**Questões**

- Uma decisão por tela: escolher e responder (Hick).
- Alternativas como alvos grandes, de 48 px de altura ou mais (Fitts), com atalhos 1 a 6 e Enter.
- Progresso "Questão 2 de 5" com barra (Gradiente de Meta).
- O resultado aparece logo abaixo do enunciado, e "Próxima questão" fica fixa acima da barra de navegação no celular, ao alcance do polegar (Fitts). Antes, o aluno precisava rolar a cada questão.
- A explicação da correta e da escolhida já vem aberta; as outras ficam em "Por que não é esta" (divulgação progressiva).
- O fim da sessão mostra acertos por assunto e o próximo passo (Pico-Fim).

**Revisões**

- Frente, depois "Mostrar resposta" e 4 notas. "Bom" é o destaque, porque é a nota mais comum (Von Restorff).
- Cada botão mostra quando o cartão volta ("Bom · 4 dias") antes da escolha (Doherty, Tesler).
- Os botões ficam fixos no rodapé no celular (Fitts).

**Editorial**

- A fila do revisor abre direto em "Em revisão" (Pareto: é a tarefa dele).
- A correta se escolhe por um rádio único, então não dá para marcar duas (Postel no limite certo).
- A explicação fica ao lado de cada alternativa (Proximidade), e o que falta para enviar à revisão aparece antes do envio.
- Só aparecem as ações possíveis no status atual: toda ação tem efeito, sem botão inerte.

**Privacidade**

- Cada finalidade em uma linha, e só o que é opcional tem botão (Occam).
- Exportar é um clique. Excluir pede confirmação digitada, porque não tem volta.

## Revisão do fluxo principal (02/11/2026)

**Contexto:** aluno no celular, do cadastro até a primeira sessão de questões e a revisão. Revisão feita sobre o build de produção, com prints em tema claro e escuro (prévia em `docs/previa-design-gutta.png`).

**Prioridade alta (corrigido)**

- **Questão, botão "Próxima" fora da tela no celular.** _Lei de Fitts._ Depois de responder, o aluno rolava a página a cada questão para achar o resultado e o botão. **Correção:** resultado logo abaixo do enunciado e barra de ação fixa acima da navegação inferior.
- **Onboarding enviava antes do último passo.** _Gradiente de Meta, quebrado._ O React reaproveitava o botão "Continuar" como `submit`. **Correção:** botões com `key` distintas e teste E2E cobrindo os 3 passos.
- **Painel recomendava "Revisar 4 flashcards" para quem acabou de chegar.** _Pareto e personalização verificável._ Cartões novos eram contados como revisão atrasada. **Correção:** só vencidos entram na prioridade 1; o aluno novo recebe o diagnóstico.
- **Botão "Bom" invisível na revisão.** _Von Restorff, invertido._ O destaque saía branco porque o fundo genérico vencia a cor do acento. **Correção:** fundo definido por variante.

**Prioridade média (corrigido)**

- **Erro continuava na tela depois de corrigido.** _Doherty, feedback._ **Correção:** o erro do campo some na hora em que o aluno o corrige; um erro novo do servidor volta a aparecer.
- **"Responder" apagado sem explicação.** _Doherty._ **Correção:** "Escolha uma alternativa" ao lado do botão enquanto ele está desabilitado.
- **Revisões abaixo das disciplinas no celular.** _Posição Serial._ A 3ª prioridade da SPEC ficava no fim da página. **Correção:** o bloco vem logo depois da questão do dia.
- **Links no meio do texto distinguíveis só pela cor.** _WCAG 1.4.1 (axe)._ **Correção:** links sublinhados por padrão.

**Rápidos (corrigido)**

- "Por que não esta" virou "Por que não é esta".
- O favicon da gota tirava um 404 de cada página.

**O que já está bom (não desfazer)**

- Um único primário por tela, na cor do acento (Von Restorff): landing, painel e questão.
- Progresso visível no onboarding, nas questões e nas revisões (Gradiente de Meta).
- Selo "Demonstração · sem revisão" em todo conteúdo não revisado. É informação honesta, não ruído.

**Para depois (não bloqueia o piloto)**

- Testar com 5 alunos do teste de corredor (dezembro). A revisão por leis de UX não substitui observar gente de verdade.
- Auditoria manual de acessibilidade com leitor de tela (VoiceOver e TalkBack). A varredura automática (axe, WCAG 2.2 AA) passa nas 10 telas principais.
- O módulo mostra um retângulo vazio quando a aula externa não carrega no iframe. Detectar o erro e trocar pelo botão "Abrir a aula".

## Experimento: visual de vidro (glassmorphism), 02/11/2026

**O que é:** um segundo visual, opcional, com fundo de manchas nas cores da marca (verde-água e brasa) e cartões e barras translúcidos com desfoque. O visual clássico continua sendo o padrão. Prévia lado a lado em `docs/previa-vidro-gutta.png`.

**Como ver:** em `/app/perfil`, bloco "Visual (experimento)", ou com `?look=glass` em qualquer endereço (`?look=classic` volta). A escolha fica só naquele navegador (`localStorage`), não na conta.

**Como funciona:** tudo está em `apps/web/src/styles/glass.css` e só vale com `<html data-look="glass">`. Um script curto no `<head>` liga o atributo antes da pintura, para não piscar o visual clássico. Os componentes só ganharam as classes-gancho `glass-card`, `glass-bar` e `glass-bar-mobile`, que não fazem nada no visual clássico.

**Cuidados tomados**

- _Efeito Estética-Usabilidade, nos dois sentidos._ Bonito ajuda o aluno a tolerar atrito, mas transparência pode custar leitura. O texto fica sempre sobre o vidro, não sobre a mancha saturada, e a varredura axe (WCAG 2.2 AA) passa no claro e no escuro (teste E2E "visual de vidro").
- _Von Restorff preservado._ O botão primário continua sólido, só com um brilho leve. Vidro só nas superfícies.
- _Bug evitado:_ `backdrop-filter` num ancestral prende `position: fixed`. Por isso o desfoque do cartão fica num pseudo-elemento; senão a barra "Próxima questão" do celular ficaria presa dentro do cartão. O E2E confere que ela continua no rodapé da tela.
- _Acessibilidade e aparelho simples._ Quem ativa "reduzir transparência" no sistema, ou usa navegador sem `backdrop-filter`, recebe superfícies quase opacas. Não há vidro dentro de vidro, que é o que mais pesa na GPU.

**Para decidir:**

- Mostrar a prévia ao time e, no teste de corredor, deixar alguns alunos usarem o vidro.
- O que observar: tempo para achar o próximo passo e queixas de leitura no sol.
- Falta medir o custo do desfoque em Android de entrada. Se ficar lento, o caminho é diminuir o raio do desfoque ou desligá-lo só no celular.

## Identidade visual do protótipo do Lovable (03/11/2026, ADR 0007)

**O que mudou:** o tema escuro passou a ser o padrão, com o vermelho da marca, Archivo Black nos títulos e Hind no texto. Disciplinas e módulos viraram capas, a landing ganhou capa, o login ficou em tela dividida e o painel ganhou indicadores no topo.

**O que foi mantido (não desfazer)**

- _Von Restorff._ Continua havendo um único primário por tela, agora em vermelho.
- _Personalização verificável._ Os indicadores do painel (revisões hoje, questões na semana, dias com estudo, próxima prova) são dados do aluno. Ranking e recorde do protótipo ficaram de fora, porque seriam número inventado e um streak que pune.
- _Fitts no celular._ A barra de ação fixa e a navegação inferior continuam iguais. No módulo, as ações vêm logo abaixo do título no celular e no quadro lateral no desktop.
- _Honestidade._ O selo "Demonstração · sem revisão" continua em todo conteúdo de demonstração.

**Cuidados**

- A cor de erro é parecida com a da marca. O erro nunca depende só da cor: sempre há ícone e texto ("Sua resposta", "Não foi dessa vez").
- A fileira "Como funciona" da landing rola na horizontal no celular, então ela é focável pelo teclado (axe: scrollable-region-focusable).
- O botão de tema tem nome acessível ("Ativar tema claro" ou "Ativar tema escuro").
