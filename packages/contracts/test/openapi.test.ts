import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApi } from '../src/openapi';
import { defineRoute } from '../src/registry';
import { routes } from '../src/routes';

describe('OpenAPI gerado', () => {
  it('é OpenAPI 3.1 com o erro padrão em components', () => {
    const doc = buildOpenApi() as {
      openapi: string;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.components.schemas.ApiError!.properties!)).toEqual([
      'code',
      'message',
      'details',
      'requestId',
    ]);
    expect(JSON.stringify(doc)).not.toContain('#/$defs');
  });

  it('descreve parâmetros, corpo, idempotência e erros', () => {
    const route = defineRoute({
      method: 'post',
      path: '/api/v1/coisas/{id}',
      summary: 'Teste',
      tags: ['teste'],
      idempotent: true,
      params: z.object({ id: z.uuid() }),
      query: z.object({ dry: z.coerce.boolean().optional() }),
      body: z.object({ nome: z.string().min(1) }),
      response: z.object({ ok: z.boolean() }),
      status: 201,
      errors: ['not_found', 'conflict'],
    });
    type Op = {
      operationId: string;
      parameters: { name: string; in: string }[];
      requestBody: { content: Record<string, { schema: { required?: string[] } }> };
      responses: Record<string, unknown>;
    };
    const doc = buildOpenApi([route]) as { paths: Record<string, Record<string, Op>> };
    const op = doc.paths['/api/v1/coisas/{id}']!.post!;
    expect(op.operationId).toBe('postApiV1CoisasId');
    expect(op.parameters.map((p) => `${p.in}:${p.name}`)).toEqual([
      'path:id',
      'query:dry',
      'header:idempotency-key',
    ]);
    expect(op.requestBody.content['application/json']!.schema.required).toEqual(['nome']);
    expect(Object.keys(op.responses).sort()).toEqual([
      '201',
      '400',
      '401',
      '403',
      '404',
      '409',
      '500',
    ]);
  });

  it('não repete método e caminho', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('todo caminho novo fica sob /api/v1 (ou é o health)', () => {
    for (const r of routes)
      expect(r.path === '/api/health' || r.path.startsWith('/api/v1/')).toBe(true);
  });
});
