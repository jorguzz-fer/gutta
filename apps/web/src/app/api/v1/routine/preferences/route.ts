import { routine } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { savePreferences } from '@/features/routine/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(routine.savePreferences, ({ userId, body }) =>
  savePreferences(userId, body),
);
