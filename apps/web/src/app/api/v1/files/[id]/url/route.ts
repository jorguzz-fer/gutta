import { files } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { fileUrl } from '@/features/files/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/files/{id}/url: URL assinada de vida curta (original, PDF ou miniatura).
export const GET = contractRoute(files.fileUrl, ({ userId, params, query }) =>
  fileUrl(userId, params.id, query),
);
