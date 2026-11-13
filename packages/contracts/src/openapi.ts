import { z } from 'zod';
import { ApiErrorSchema, IDEMPOTENCY_HEADER } from './common';
import { statusOf, type ErrorCode, type RouteDef } from './registry';
import { routes } from './routes';

type Json = Record<string, unknown>;

function schemaOf(s: z.ZodType, io: 'input' | 'output'): Json {
  const out = z.toJSONSchema(s, { io, target: 'draft-2020-12', unrepresentable: 'any' }) as Json;
  delete out.$schema;
  return out;
}

function parameters(def: RouteDef): Json[] {
  const list: Json[] = [];
  const add = (where: 'path' | 'query', obj?: z.ZodObject) => {
    if (!obj) return;
    const js = schemaOf(obj, 'input') as { properties?: Json; required?: string[] };
    for (const [name, schema] of Object.entries(js.properties ?? {})) {
      list.push({
        name,
        in: where,
        required: where === 'path' || (js.required ?? []).includes(name),
        schema,
      });
    }
  };
  add('path', def.params);
  add('query', def.query);
  if (def.idempotent) {
    list.push({
      name: IDEMPOTENCY_HEADER,
      in: 'header',
      required: false,
      description: 'Chave única por operação; repetir com a mesma chave não repete o efeito.',
      schema: { type: 'string', maxLength: 200 },
    });
  }
  return list;
}

const BASE_ERRORS: ErrorCode[] = ['invalid_request', 'internal_error'];
const AUTH_ERRORS: ErrorCode[] = ['unauthenticated', 'email_not_verified'];

/** Documento OpenAPI 3.1 gerado das rotas registradas (ADR 0019). */
export function buildOpenApi(list: RouteDef[] = routes): Json {
  const paths: Record<string, Json> = {};
  const sorted = [...list].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
  for (const def of sorted) {
    const codes = new Set<ErrorCode>([
      ...BASE_ERRORS,
      ...(def.public ? [] : AUTH_ERRORS),
      ...(def.errors ?? []),
    ]);
    const responses: Json = {
      [String(def.status ?? 200)]: {
        description: 'Sucesso',
        content: { 'application/json': { schema: schemaOf(def.response, 'output') } },
      },
    };
    for (const code of [...codes].sort()) {
      const status = String(statusOf(code));
      const prev = responses[status] as { description: string } | undefined;
      responses[status] = {
        description: prev ? `${prev.description}, ${code}` : code,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      };
    }
    const op: Json = {
      summary: def.summary,
      tags: def.tags,
      operationId: `${def.method}${def.path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? '').toUpperCase())}`,
      parameters: parameters(def),
      responses,
      ...(def.public ? { security: [] } : {}),
    };
    if (def.body) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: schemaOf(def.body, 'input') } },
      };
    }
    paths[def.path] = { ...(paths[def.path] ?? {}), [def.method]: op };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Cognuss API',
      version: 'v1',
      description:
        'Contrato da API /api/v1 da Cognuss, gerado dos esquemas Zod de @gutta/contracts. Não edite à mão.',
    },
    paths,
    components: {
      schemas: { ApiError: schemaOf(ApiErrorSchema, 'output') },
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'gutta.session_token' },
      },
    },
    security: [{ session: [] }],
  };
}
