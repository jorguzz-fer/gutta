import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser } from '../src/client';
import * as s from '../src/schema';
import { connect, makeUser, pgCode } from './helpers';

// Equilíbrio (SPEC v2, 5.4 e 8.3; plano, item 58).
const { app, owner, appPool, ownerPool } = connect();

async function setup(user: string) {
  return withUser(app, user, async (tx) => {
    const [t] = await tx
      .insert(s.studentTerms)
      .values({ ownerId: user, label: 'Atual' })
      .returning();
    const [d] = await tx
      .insert(s.enrolledDisciplines)
      .values({ ownerId: user, termId: t!.id, name: 'BMF' })
      .returning();
    const [task] = await tx
      .insert(s.studyTasks)
      .values({ ownerId: user, disciplineId: d!.id, title: 'Revisar', estimatedMinutes: 60 })
      .returning();
    const [p] = await tx
      .insert(s.planProposals)
      .values({ ownerId: user, weekStart: '2026-11-16', algorithmVersion: 'x', inputSnapshot: {} })
      .returning();
    const start = new Date('2026-11-17T22:00:00Z');
    await tx.insert(s.studySessions).values({
      ownerId: user,
      proposalId: p!.id,
      taskId: task!.id,
      disciplineId: d!.id,
      title: 'Revisar',
      startsAt: start,
      endsAt: new Date(start.getTime() + 30 * 60_000),
    });
    return { disc: d!.id, task: task!.id, proposal: p!.id };
  });
}

let ana: string;
let beto: string;
let a: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  ana = await makeUser(owner);
  beto = await makeUser(owner);
  a = await setup(ana);
  await setup(beto);
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('Equilíbrio: isolamento', () => {
  it('cada aluno só vê o que é seu', async () => {
    const seen = await withUser(app, beto, async (tx) => ({
      tasks: await tx.select().from(s.studyTasks),
      proposals: await tx.select().from(s.planProposals),
      sessions: await tx.select().from(s.studySessions),
    }));
    expect(seen.tasks).toHaveLength(1);
    expect(seen.proposals).toHaveLength(1);
    expect(seen.sessions).toHaveLength(1);
    expect(seen.tasks[0]!.ownerId).toBe(beto);
  });

  it('não aponta para tarefa, proposta ou disciplina de outro', async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 60_000);
    const tries = [
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.studyTasks).values({
            ownerId: beto,
            disciplineId: a.disc,
            title: 'x',
            estimatedMinutes: 30,
          }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx
            .insert(s.studySessions)
            .values({ ownerId: beto, taskId: a.task, title: 'x', startsAt: start, endsAt: end }),
        ),
      () =>
        withUser(app, beto, (tx) =>
          tx.insert(s.studySessions).values({
            ownerId: beto,
            proposalId: a.proposal,
            title: 'x',
            startsAt: start,
            endsAt: end,
          }),
        ),
    ];
    for (const run of tries) expect(pgCode(await run().catch((e) => e))).toBe('42501');
  });

  it('o mesmo pedido de outro módulo não vira duas tarefas', async () => {
    const add = () =>
      withUser(app, ana, (tx) =>
        tx.insert(s.studyTasks).values({
          ownerId: ana,
          title: 'Revisão da aula',
          estimatedMinutes: 30,
          origin: 'aula',
          sourceRef: 'aula:1',
        }),
      );
    await add();
    expect(pgCode(await add().catch((e) => e))).toBe('23505');
  });

  it('preferências com os padrões da SPEC (EQU-01)', async () => {
    const [p] = await withUser(app, ana, (tx) =>
      tx.insert(s.planningPreferences).values({ userId: ana }).returning(),
    );
    expect(p).toMatchObject({
      preferredPeriod: 'varia',
      sessionMinutes: 30,
      intensity: 'equilibrada',
      priority: 'bem_estar',
      breakMinutes: 10,
      maxConsecutive: 2,
    });
  });
});
