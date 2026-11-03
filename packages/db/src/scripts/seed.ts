import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb, createPool, type Db } from '../client';
import { hashPassword } from '../password';
import * as s from '../schema';
import { seedCatalog } from './catalog-seed';
import { loadEnv, requireEnv } from './env';

/*
  Seeds de DEMONSTRAÇÃO (ADR 0005). Nada aqui é conteúdo editorial revisado:
  tudo sai com is_demo = true e aparece com o selo "Demonstração · sem revisão".
  Idempotente: pode rodar de novo sem duplicar.
*/

export const DEMO_USERS = [
  { email: 'aluno@gutta.test', name: 'Aluna Demonstração', roles: ['student'] },
  { email: 'aluno2@gutta.test', name: 'Aluno Demonstração 2', roles: ['student'] },
  { email: 'editor@gutta.test', name: 'Editor Demonstração', roles: ['editor'] },
  { email: 'revisor@gutta.test', name: 'Revisora Demonstração', roles: ['reviewer'] },
  { email: 'admin@gutta.test', name: 'Admin Demonstração', roles: ['admin'] },
] as const;

export const DEMO_PASSWORD_DEFAULT = 'gutta-demo-2026';

async function upsertUser(db: Db, u: (typeof DEMO_USERS)[number], passwordHash: string) {
  const existing = await db.query.authUsers.findFirst({ where: eq(s.authUsers.email, u.email) });
  const id = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(s.authUsers).values({ id, email: u.email, name: u.name, emailVerified: true });
    await db.insert(s.authAccounts).values({
      id: randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash,
    });
  }
  await db
    .insert(s.profiles)
    .values({ userId: id, displayName: u.name })
    .onConflictDoNothing({ target: s.profiles.userId });
  for (const role of u.roles) {
    await db.insert(s.roleAssignments).values({ userId: id, role }).onConflictDoNothing();
  }
  return id;
}

export type SeedResult = {
  users: Record<string, string>;
  courseId: string;
  disciplines: Record<string, string>;
  topics: Record<string, string>;
};

export async function runSeed(url: string): Promise<SeedResult> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Seeds de demonstração não rodam em produção (ADR 0005).');
  }
  const pool = createPool(url, 2);
  const db = createDb(pool);
  try {
    const passwordHash = await hashPassword(process.env.SEED_PASSWORD ?? DEMO_PASSWORD_DEFAULT);
    const users: Record<string, string> = {};
    for (const u of DEMO_USERS) users[u.email] = await upsertUser(db, u, passwordHash);

    const { courseId, disciplines, topics } = await seedCatalog(db, {
      authorId: users['editor@gutta.test']!,
      reviewerId: users['revisor@gutta.test']!,
    });

    return { users, courseId, disciplines, topics };
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  runSeed(requireEnv('DATABASE_OWNER_URL'))
    .then(() => console.log('seeds de demonstração aplicados'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
