import { disciplines } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { createDiscipline, listDisciplines } from '@/features/academics/service';

export const dynamic = 'force-dynamic';

export const GET = contractRoute(disciplines.listDisciplines, ({ userId }) =>
  listDisciplines(userId),
);
export const POST = contractRoute(disciplines.createDiscipline, ({ userId, body }) =>
  createDiscipline(userId, body),
);
