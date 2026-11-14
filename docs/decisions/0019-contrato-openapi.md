# ADR 0019: Contrato da API em OpenAPI, gerado dos esquemas Zod

- Status: aceito (Fernando, 13/11/2026)
- Data: 2026-11-13

## Contexto

O blueprint (§1.6, §8) pede o contrato como fonte de verdade: API descrita em OpenAPI, com tipos e cliente gerados dele.

O ADR 0001 deixou isso para depois, enquanto o único cliente fosse o próprio app. Hoje cada rota de `/api/v1` valida a entrada com Zod dentro do próprio arquivo, e o cliente do navegador (`lib/client-api.ts`) repete os tipos à mão.

A v2 muda o cenário:
- o modo offline (SPEC v2, AUL-27) precisa de um cliente tipado que enfileire e reenvie chamadas;
- o `worker` (ADR 0013) chama os mesmos serviços;
- um app nativo continua possível;
- o número de rotas mais que dobra (SPEC v2, seção 9).

## Opções consideradas

1. **Escrever o OpenAPI à mão e gerar o código dele.** Contra: duas fontes de verdade (o YAML e o Zod que valida), que divergem com o tempo.
2. **Trocar as rotas por um framework de RPC tipado.** Contra: reescreve a camada de entrada que já funciona e foge do REST que o blueprint pede.
3. **Manter o Zod como fonte e gerar o OpenAPI 3.1 a partir dele.**

## Decisão

Opção 3.

**Pacote `packages/contracts`**
- Os esquemas Zod de entrada e saída de cada rota de `/api/v1`, mais um registro que associa cada rota (método, caminho, esquemas, erros possíveis) aos esquemas.
- As rotas importam o esquema de lá em vez de declarar no próprio arquivo.

**Geração**
- `pnpm contracts:build` gera `packages/contracts/openapi.json` (OpenAPI 3.1) a partir do registro, usando a conversão para JSON Schema que o próprio Zod 4 oferece.
- O arquivo gerado fica no repositório, para a diferença aparecer na revisão do PR.
- O CI falha se o arquivo gerado estiver desatualizado em relação aos esquemas.

**Cliente.** O cliente do navegador passa a usar tipos inferidos dos mesmos esquemas, sem gerador externo. Cliente gerado para outra linguagem só quando houver esse cliente.

**O que continua igual**
- Erro `{ code, message, requestId }`. Ele vira um esquema do contrato e não muda para o formato do RFC 7807: o app já depende dele, e não há terceiros consumindo a API (a seção 8 do blueprint é opcional).
- Paginação por cursor e chave idempotente nas escritas, agora declaradas no contrato.
- Server actions continuam existindo para formulários; quando uma action e uma rota fazem a mesma coisa, as duas usam o mesmo esquema.

**Migração.** As rotas existentes passam para `packages/contracts` aos poucos, começando pelas novas da v2. O CI só exige contrato para rotas novas até a migração acabar.

## Consequências

- O contrato fica visível e revisável. A documentação da API sai do mesmo arquivo, e só é publicada por rede interna, se um dia for.
- Mais um pacote no monorepo e mais um passo no CI.
- Quem cria uma rota nova escreve o esquema em `packages/contracts`, não no arquivo da rota.
