import { grades } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getGrades } from '@/features/grades/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(grades.getGrades, ({ userId, params }) =>
  getGrades(userId, params.id),
);
