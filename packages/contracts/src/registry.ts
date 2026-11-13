import type { z } from 'zod';

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type ErrorCode =
  | 'invalid_request'
  | 'unauthenticated'
  | 'email_not_verified'
  | 'forbidden'
  | 'forbidden_origin'
  | 'not_found'
  | 'conflict'
  | 'feature_disabled'
  | 'rate_limited'
  | 'internal_error';

export type RouteDef = {
  method: Method;
  /** Caminho no formato OpenAPI, com parâmetros entre chaves: /api/v1/files/{id}. */
  path: string;
  summary: string;
  tags: string[];
  /** Rota sem sessão (health, por exemplo). Padrão: exige sessão com e-mail confirmado. */
  public?: boolean;
  /** Escrita que aceita o cabeçalho idempotency-key. */
  idempotent?: boolean;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
  /** Status de sucesso. Padrão 200. */
  status?: number;
  errors?: ErrorCode[];
};

export function defineRoute<const R extends RouteDef>(def: R): R {
  return def;
}

const STATUS_OF: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  email_not_verified: 403,
  forbidden: 403,
  forbidden_origin: 403,
  not_found: 404,
  conflict: 409,
  feature_disabled: 404,
  rate_limited: 429,
  internal_error: 500,
};

export function statusOf(code: ErrorCode) {
  return STATUS_OF[code];
}
