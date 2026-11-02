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

## Revisão do fluxo principal

Os resultados da revisão estão na próxima seção.
