import { disciplines } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { removeDiscipline, updateDiscipline } from '@/features/academics/service';

export const dynamic = 'force-dynamic';

export const PATCH = contractRoute(disciplines.updateDiscipline, ({ userId, params, body }) =>
  updateDiscipline(userId, params.id, body),
);
export const DELETE = contractRoute(disciplines.removeDiscipline, ({ userId, params }) =>
  removeDiscipline(userId, params.id),
);
