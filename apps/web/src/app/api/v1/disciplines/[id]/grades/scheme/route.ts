import { grades } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { saveScheme } from '@/features/grades/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(grades.saveScheme, ({ userId, params, body }) =>
  saveScheme(userId, params.id, body),
);
