import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { removeAssessment, updateAssessment } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(calendar.updateAssessment, ({ userId, params, body }) =>
  updateAssessment(userId, params.id, body),
);

export const DELETE = contractRoute(calendar.removeAssessment, ({ userId, params }) =>
  removeAssessment(userId, params.id),
);
