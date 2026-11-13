import { calendar } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getAssessment, removeAssessment, updateAssessment } from '@/features/calendar/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(calendar.updateAssessment, ({ userId, params, body }) =>
  updateAssessment(userId, params.id, body),
);

export const DELETE = contractRoute(calendar.removeAssessment, ({ userId, params }) =>
  removeAssessment(userId, params.id),
);

export const GET = contractRoute(calendar.getAssessment, ({ userId, params }) =>
  getAssessment(userId, params.id),
);
