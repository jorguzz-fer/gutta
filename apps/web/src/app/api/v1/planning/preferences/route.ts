import { planning as c } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getPreferences, savePreferences } from '@/features/planning/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(c.getPreferences, ({ userId }) => getPreferences(userId));

export const PUT = contractRoute(c.savePreferences, ({ userId, body }) =>
  savePreferences(userId, body),
);
