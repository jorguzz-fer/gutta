import { z } from 'zod';
import { defineRoute } from '../registry';

export const health = defineRoute({
  method: 'get',
  path: '/api/health',
  summary: 'Saúde do processo e do banco, para o container e o Coolify.',
  tags: ['sistema'],
  public: true,
  response: z.object({
    status: z.enum(['ok', 'degraded']),
    db: z.enum(['ok', 'down']),
    ms: z.number().optional(),
  }),
});
