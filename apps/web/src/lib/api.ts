import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { auth } from './auth/server';
import { env } from './env';
import { logger } from './logger';

// Contrato de erro da SPEC §11: { code, message, details?, requestId }.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') =>
  new ApiError(404, 'not_found', `${what} não encontrado.`);
export const conflict = (message: string) => new ApiError(409, 'conflict', message);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'invalid_request', message, details);

export type ApiContext = { userId: string; requestId: string; req: Request };

/**
 * Envelope dos route handlers /api/v1: identidade só da sessão, e-mail confirmado,
 * checagem de origem em mutações (CSRF), validação Zod, erros padronizados e log com requestId.
 */
export function apiRoute<P = Record<string, string>>(
  fn: (ctx: ApiContext & { params: P }) => Promise<unknown>,
  opts: { public?: boolean } = {},
) {
  return async (req: Request, segment: { params: Promise<P> }) => {
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const started = Date.now();
    const headers = { 'x-request-id': requestId, 'cache-control': 'no-store' };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const origin = req.headers.get('origin');
        if (origin && origin !== new URL(env().APP_URL).origin) {
          throw new ApiError(403, 'forbidden_origin', 'Origem não permitida.');
        }
      }
      let userId = '';
      if (!opts.public) {
        const session = await auth().api.getSession({ headers: req.headers });
        if (!session) throw new ApiError(401, 'unauthenticated', 'Faça login para continuar.');
        if (!session.user.emailVerified)
          throw new ApiError(403, 'email_not_verified', 'Confirme seu e-mail para continuar.');
        userId = session.user.id;
      }
      const data = await fn({ userId, requestId, req, params: await segment.params });
      logger.info('api.ok', {
        requestId,
        path: new URL(req.url).pathname,
        method: req.method,
        ms: Date.now() - started,
      });
      return Response.json(data, { headers });
    } catch (caught) {
      const err =
        caught instanceof z.ZodError
          ? badRequest(
              'Dados inválidos.',
              caught.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            )
          : caught;
      if (err instanceof ApiError) {
        logger.warn('api.error', {
          requestId,
          code: err.code,
          status: err.status,
          path: new URL(req.url).pathname,
        });
        return Response.json(
          { code: err.code, message: err.message, details: err.details, requestId },
          { status: err.status, headers },
        );
      }
      logger.error('api.unexpected', {
        requestId,
        err: String(err),
        path: new URL(req.url).pathname,
      });
      return Response.json(
        { code: 'internal_error', message: 'Algo deu errado. Tente de novo.', requestId },
        { status: 500, headers },
      );
    }
  };
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest('Corpo da requisição precisa ser JSON.');
  }
  return schema.parse(body);
}

/** Papel exigido numa rota de API. Admin precisa de 2FA ativo, como na área /admin. */
export async function requireApiRole(userId: string, roles: string[]) {
  const { getRoles } = await import('./auth/session');
  const { db } = await import('./db');
  const { schema, eq } = await import('@gutta/db');
  const userRoles = await getRoles(userId);
  if (!userRoles.some((r) => roles.includes(r)))
    throw new ApiError(403, 'forbidden', 'Sem permissão para essa ação.');
  if (userRoles.includes('admin')) {
    const u = await db().query.authUsers.findFirst({ where: eq(schema.authUsers.id, userId) });
    if (!u?.twoFactorEnabled)
      throw new ApiError(403, 'mfa_required', 'Ative a verificação em duas etapas.');
  }
  return userRoles;
}
