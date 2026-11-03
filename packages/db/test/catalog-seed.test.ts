import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { seedCatalog } from '../src/scripts/catalog-seed';
import { connect } from './helpers';

const { owner, appPool, ownerPool } = connect();
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

const counts = async () =>
  (
    await owner.execute<{ t: string; n: number }>(sql`
      select 'cursos' t, count(*)::int n from courses union all
      select 'disciplinas', count(*)::int from disciplines union all
      select 'modulos', count(*)::int from modules union all
      select 'questoes', count(*)::int from questions union all
      select 'flashcards', count(*)::int from flashcards where visibility = 'editorial' union all
      select 'usuarios', count(*)::int from auth_users`)
  ).rows;

describe('SEED_CATALOG=demo (catálogo de produção)', () => {
  it('é idempotente e não cria usuário', async () => {
    await seedCatalog(owner, { authorId: null, reviewerId: null });
    const before = await counts();
    const cat = await seedCatalog(owner, { authorId: null, reviewerId: null });
    expect(await counts()).toEqual(before);
    expect(Object.keys(cat.topics)).toHaveLength(6);
  });
});
