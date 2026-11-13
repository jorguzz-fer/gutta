import 'server-only';
import type { z } from 'zod';
import type { RouteDef } from '@gutta/contracts';
import { apiRoute, readJson, type ApiContext } from './api';
import { env } from './env';

type Out<T> = T extends z.ZodType ? z.output<T> : undefined;

export type ContractContext<R extends RouteDef> = ApiContext & {
  params: Out<R['params']>;
  query: Out<R['query']>;
  body: Out<R['body']>;
};

/**
 * Route handler a partir do contrato de @gutta/contracts (ADR 0019): parâmetros, query e
 * corpo validados pelo mesmo esquema que gera o OpenAPI. Fora de produção, a resposta também
 * é conferida, para o contrato não divergir do código sem ninguém ver.
 */
export function contractRoute<R extends RouteDef>(
  def: R,
  fn: (ctx: ContractContext<R>) => Promise<z.input<R['response']>>,
) {
  return apiRoute<Record<string, string>>(
    async (ctx) => {
      const url = new URL(ctx.req.url);
      const params = def.params ? def.params.parse(ctx.params) : undefined;
      const query = def.query ? def.query.parse(Object.fromEntries(url.searchParams)) : undefined;
      const body = def.body ? await readJson(ctx.req, def.body) : undefined;
      const data = await fn({ ...ctx, params, query, body } as ContractContext<R>);
      if (env().NODE_ENV !== 'production') def.response.parse(data);
      return data;
    },
    { public: def.public, status: def.status },
  );
}
