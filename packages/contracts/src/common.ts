import { z } from 'zod';

// Contrato de erro de toda a API (SPEC v1 §11, ADR 0019). Não muda para RFC 7807: o app já
// depende dele e a API não tem consumidores de fora.
export const ApiErrorSchema = z
  .object({
    code: z.string().meta({ description: 'Código estável, para o cliente decidir o que fazer.' }),
    message: z.string().meta({ description: 'Mensagem em português, para mostrar ao usuário.' }),
    details: z.unknown().optional(),
    requestId: z.string(),
  })
  .meta({ description: 'Erro padrão da API.' });

export const Uuid = z.uuid();

/** Paginação por cursor (blueprint §8): o cliente devolve `nextCursor` para a próxima página. */
export function page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const cursorQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Cabeçalho das escritas que o cliente pode repetir (offline, nova tentativa). */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
