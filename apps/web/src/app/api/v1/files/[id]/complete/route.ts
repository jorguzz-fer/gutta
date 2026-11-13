import { files } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { completeUpload } from '@/features/files/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/files/{id}/complete: o envio terminou; o arquivo entra na fila.
export const POST = contractRoute(files.completeUpload, ({ userId, params, requestId }) =>
  completeUpload(userId, params.id, requestId),
);
