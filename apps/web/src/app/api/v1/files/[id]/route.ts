import { files } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { getFile } from '@/features/files/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/files/{id}: estado do arquivo e do processamento.
export const GET = contractRoute(files.getFile, ({ userId, params }) => getFile(userId, params.id));
