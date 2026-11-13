import type { z } from 'zod';
import type { system } from '@gutta/contracts';
import { sql } from '@gutta/db';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Healthcheck do container e do Coolify: o processo responde e o banco também.
// Contrato: system.health em @gutta/contracts.
type Health = z.infer<typeof system.health.response>;
export async function GET() {
  const started = Date.now();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: 'ok', db: 'ok', ms: Date.now() - started } satisfies Health);
  } catch {
    return Response.json({ status: 'degraded', db: 'down' } satisfies Health, { status: 503 });
  }
}
