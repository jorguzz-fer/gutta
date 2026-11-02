import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

const { app, owner, appPool, ownerPool } = connect();
let ana: string;
let beto: string;
let cardAna: string;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  const [c] = await withUser(app, ana, (tx) =>
    tx
      .insert(s.flashcards)
      .values({ ownerId: ana, front: 'Privado da Ana', back: 'verso' })
      .returning(),
  );
  cardAna = c!.id;
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('flashcards', () => {
  it('cartão pessoal é invisível para outro aluno', async () => {
    const seen = await withUser(app, beto, (tx) =>
      tx.select().from(s.flashcards).where(eq(s.flashcards.id, cardAna)),
    );
    expect(seen).toHaveLength(0);
    const own = await withUser(app, ana, (tx) =>
      tx.select().from(s.flashcards).where(eq(s.flashcards.id, cardAna)),
    );
    expect(own).toHaveLength(1);
  });

  it('ninguém agenda ou revisa o cartão privado de outro', async () => {
    const sched = await withUser(app, beto, (tx) =>
      tx.insert(s.flashcardSchedules).values({
        studentId: beto,
        flashcardId: cardAna,
        dueAt: new Date(),
        algorithmVersion: 't',
      }),
    ).catch((e) => e);
    expect(pgCode(sched)).toBe('42501');
    const review = await withUser(app, beto, (tx) =>
      tx.insert(s.flashcardReviews).values({
        studentId: beto,
        flashcardId: cardAna,
        rating: 2,
        prevIntervalDays: 0,
        nextDueAt: new Date(),
        clientReviewKey: `k-${Date.now()}`,
      }),
    ).catch((e) => e);
    expect(pgCode(review)).toBe('42501');
  });

  it('aluno não cria cartão editorial nem cartão em nome de outro', async () => {
    const editorial = await withUser(app, ana, (tx) =>
      tx
        .insert(s.flashcards)
        .values({ ownerId: null, visibility: 'editorial', status: 'draft', front: 'x', back: 'y' }),
    ).catch((e) => e);
    expect(pgCode(editorial)).toBe('42501');
    const forged = await withUser(app, ana, (tx) =>
      tx.insert(s.flashcards).values({ ownerId: beto, front: 'x', back: 'y' }),
    ).catch((e) => e);
    expect(pgCode(forged)).toBe('42501');
  });

  it('revisões são imutáveis e o agendamento de um não aparece para o outro', async () => {
    const editorial = await owner.query.flashcards.findFirst({
      where: eq(s.flashcards.visibility, 'editorial'),
    });
    await withUser(app, ana, async (tx) => {
      await tx.insert(s.flashcardSchedules).values({
        studentId: ana,
        flashcardId: editorial!.id,
        dueAt: new Date(),
        algorithmVersion: 't',
      });
      await tx.insert(s.flashcardReviews).values({
        studentId: ana,
        flashcardId: editorial!.id,
        rating: 2,
        prevIntervalDays: 0,
        nextDueAt: new Date(),
        clientReviewKey: `ok-${Date.now()}`,
      });
    });
    const upd = await withUser(app, ana, (tx) =>
      tx.update(s.flashcardReviews).set({ rating: 3 }).where(eq(s.flashcardReviews.studentId, ana)),
    ).catch((e) => e);
    expect(pgCode(upd)).toBe('42501');
    const schedulesOfAnaSeenByBeto = await withUser(app, beto, (tx) =>
      tx.select().from(s.flashcardSchedules).where(eq(s.flashcardSchedules.studentId, ana)),
    );
    expect(schedulesOfAnaSeenByBeto).toHaveLength(0);
  });
});
