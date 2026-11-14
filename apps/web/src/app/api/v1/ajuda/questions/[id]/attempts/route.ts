import { ajuda as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { answerQuestion } from '@/features/ajuda/service';

export const dynamic = 'force-dynamic';

export const POST = contractRoute(c.answerQuestion, ({ userId, params, body, req }) =>
  answerQuestion(userId, params.id, body, req.headers.get('idempotency-key')),
);
