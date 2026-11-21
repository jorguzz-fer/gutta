# Roteiro das provas reais da produção de aulas

O código das quatro fases está pronto e testado com provedores de teste (ADR 0021). Falta o critério de pronto de cada fase, que só se prova com as aulas reais e as chaves de produção. Este roteiro diz o que configurar e o que conferir.

## Antes de começar (uma vez)

1. **Worker no Coolify:** cadastre as variáveis do `docs/deploy.md`.
   - `ANTHROPIC_API_KEY`: já cadastrada.
   - `HIGGSFIELD_API_KEY_ID` e `HIGGSFIELD_API_KEY_SECRET`.
   - `ELEVENLABS_API_KEY`: plano pago, porque o gratuito recusou por fila cheia no piloto.
   - Faça o deploy do worker depois de cadastrar.
2. **Voz:** em `/admin/producao/vozes`, cole o id da voz "Henrique" da ElevenLabs (Voices, "Copy voice ID") na linha de Fisiologia Endócrina. Confira a cota diária: o padrão é 300 créditos, e uma aula com 2 vídeos fica entre 150 e 250.
3. **Pessoas:**
   - Quem envia a aula: um admin, com a verificação em duas etapas ativa.
   - Quem revisa: o Dr. Rafael, com o papel **revisor** (Admin, Usuários). Ele não pode ser quem enviou a aula para a revisão: o banco recusa o autor aprovando o próprio conteúdo.

## Fase 1: entrada e plano

- Envie o `.ppt` da Aula 1 em `/admin/producao`.
- **Pronto quando:** o lote mostra as mesmas 13 tarefas do índice da aula.

## Fase 2: peças HTML

1. Envie a Aula 2.
2. Aprove as tarefas e clique em "Liberar geração".
3. Abra cada peça pronta.

**Pronto quando:** todas passam no linter e no teste nos temas claro e escuro sem "Gerar de novo".

## Fase 3: vídeo da insulina (Aula 1, peça 9)

1. No lote da Aula 1, a tarefa 9 deve ser do tipo "Vídeo com narração". Aprove e libere.
2. **Roteiro:** confira a narração, que vira a legenda palavra por palavra, e os termos técnicos. Ajuste o que precisar e aprove. Até aqui nada foi gasto.
3. **Imagens:** confira cada uma.
   - A anatomia está correta e não há texto dentro da imagem.
   - Nas cenas que usam outra como referência, é o mesmo paciente.
   - Refaça a que estiver errada com outra descrição.
   - Aprove só quando todas estiverem certas: animar é o que custa.
4. Clipes, narração e montagem andam sozinhos. Se aparecer um aviso:
   - **Cota do dia:** volta sozinho depois da meia-noite.
   - **Saldo ou chave:** resolva e clique em "Retomar".

**Pronto quando:** o vídeo toca na prévia da peça, com a legenda certa e os rótulos no alto.

## Fase 4: revisão e publicação

1. O admin, no lote da Aula 1, clica em "Enviar N peças para revisão".
2. O Dr. Rafael, em `/admin/revisao`, abre cada peça. Para cada uma ele confere os pontos de atenção da IA e as questões com o gabarito, e então:
   - **aprova**, podendo tirar questões da aula; ou
   - **pede ajuste** num trecho, com comentário. A nova versão volta sozinha para a fila.
3. Com as peças aprovadas, ele clica em "Publicar a aula".

**Pronto quando:** o aluno abre o módulo em Estudar, vê a peça sem o selo "Demonstração · sem revisão", e as questões aparecem na prática.

## Se algo der errado

| Sintoma | Onde olhar |
| --- | --- |
| Tarefa "Falhou" com problemas do linter ou do render | Tela da peça, histórico de versões. "Gerar de novo" com um pedido de ajuste. |
| Vídeo "Pausado" | O aviso diz o motivo: saldo, chave, voz ou falha da cena. Resolva e clique em "Retomar". |
| Revisor não vê a fila | Ele precisa do papel revisor, e a peça precisa ter sido enviada para revisão. |
| "Quem enviou a peça para revisão não pode aprová-la" | Outro revisor aprova. |
| Custos | Admin, Custos de IA: plano, peças e roteiros. Créditos de mídia ficam no lote e em Vozes e cota. |
