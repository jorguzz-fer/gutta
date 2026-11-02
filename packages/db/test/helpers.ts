import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb, createPool, type Db } from '../src/client';
import * as s from '../src/schema';
import { TEST_APP_URL, TEST_OWNER_URL } from './env';

export function connect() {
  const appPool = createPool(TEST_APP_URL, 2);
  const ownerPool = createPool(TEST_OWNER_URL, 2);
  return { appPool, ownerPool, app: createDb(appPool), owner: createDb(ownerPool) };
}

/** Cria um usuário direto no banco (como dono), com papéis opcionais. */
export async function makeUser(owner: Db, roles: (typeof s.appRole.enumValues)[number][] = []) {
  const id = randomUUID();
  await owner.insert(s.authUsers).values({
    id,
    name: `Teste ${id.slice(0, 6)}`,
    email: `${id}@teste.gutta`,
    emailVerified: true,
  });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return id;
}

export async function courseId(owner: Db) {
  const c = await owner.query.courses.findFirst({ where: eq(s.courses.slug, 'medicina') });
  return c!.id;
}

/** Erro do Postgres por código SQLSTATE (o Drizzle embrulha em `cause`). */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}
