import { sql } from '@gutta/db';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Healthcheck do container e do Coolify: o processo responde e o banco também.
export async function GET() {
  const started = Date.now();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: 'ok', db: 'ok', ms: Date.now() - started });
  } catch {
    return Response.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}
