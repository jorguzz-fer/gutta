import { grades } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { saveGrade } from '@/features/grades/service';

export const dynamic = 'force-dynamic';

export const PUT = contractRoute(grades.saveGrade, ({ userId, params, body }) =>
  saveGrade(userId, params.id, body),
);
