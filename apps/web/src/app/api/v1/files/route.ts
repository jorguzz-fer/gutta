import { files } from '@gutta/contracts';
import { contractRoute } from '@/lib/contract';
import { requestUpload } from '@/features/files/service';

export const dynamic = 'force-dynamic';

// POST /api/v1/files: pede a URL de envio (ADR 0012).
export const POST = contractRoute(files.createUpload, ({ userId, body }) =>
  requestUpload(userId, body),
);
