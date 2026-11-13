# Experimento: leitura automática de cronogramas (plano, item 36)

Objetivo: medir, com cronogramas reais, quanto a leitura por IA acerta e quanto custa antes de
construir a tela de conferência (SPEC v2, DIS-05). O resultado decide o modelo, o esforço e o
teto de custo (decisão D07).

## Como montar a pasta

1. Junte **20 cronogramas reais**, de disciplinas e professores diferentes, nos formatos que os
   alunos recebem (PDF, DOCX, XLSX). Peça autorização a quem cedeu. **Não suba para o
   repositório** cronograma com nome ou contato de aluno: esta pasta é versionada.
   Se o material não puder ser versionado, use outra pasta fora do repositório e passe o
   caminho para o comando.
2. Para cada arquivo `NOME.pdf`, escreva `NOME.esperado.json` com o que uma pessoa leria:

```json
{
  "referenceYear": 2026,
  "events": [
    {
      "date": "2026-11-12",
      "type": "aula",
      "title": "Inflamação aguda",
      "start": "08:00",
      "end": "10:00",
      "topic": "Mediadores químicos",
      "teacher": "Dra. Juliana Martins",
      "location": null
    },
    { "date": "2026-11-19", "type": "prova", "title": "Prova 1", "start": null }
  ]
}
```

- `type`: `aula`, `pratica`, `prova`, `atividade`, `entrega` ou `outro` (feriado, recesso).
- Os campos `start`, `end`, `topic`, `teacher` e `location` são opcionais no gabarito: o que
  ficar de fora não entra na conta; `null` quer dizer "o documento não traz" e a IA precisa
  devolver `null` (não inventar).

## Como rodar

Precisa de `ANTHROPIC_API_KEY`, do Poppler (`pdftotext`) e do LibreOffice (`soffice`).
Cada rodada gasta créditos da API.

```bash
pnpm --filter @gutta/ai schedule:eval
```

```bash
pnpm --filter @gutta/ai schedule:eval /caminho/da/pasta --model=claude-opus-5-5 --effort=low
```

O resultado mostra, por cronograma, o que faltou e o que sobrou, e no fim: itens encontrados
(recall), itens corretos entre os extraídos (precisão), acerto por campo e custo médio.

## Resultado

Ainda não rodado: faltam os cronogramas reais e a chave da API. Registrar aqui a data, o
modelo, o esforço e os números de cada rodada.
