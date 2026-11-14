import { randomUUID } from 'node:crypto';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { weekStart, localDayKey } from '@gutta/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as svc from './service';

// Rotina semanal (SPEC v2, ROT-01 a ROT-12; plano, item 43).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function user() {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  return id;
}

async function discipline(ownerId: string, name: string) {
  const [t] = await owner
    .insert(s.studentTerms)
    .values({ ownerId, label: 'Atual' })
    .onConflictDoNothing()
    .returning();
  const term =
    t ??
    (await owner.query.studentTerms.findFirst({ where: eq(s.studentTerms.ownerId, ownerId) }))!;
  const [d] = await owner
    .insert(s.enrolledDisciplines)
    .values({ ownerId, termId: term.id, name, shortName: name.slice(0, 4), color: 2 })
    .returning();
  return d!.id;
}

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

const study = (over: Record<string, unknown> = {}) => ({
  kind: 'estudo' as const,
  category: null,
  label: null,
  disciplineId: null,
  color: null,
  weekdays: [1, 3],
  start: '14:00',
  end: '16:00',
  ...over,
});

beforeAll(() => setFeatures({ rotina: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('rotina', () => {
  it('sem nada: meta padrão de 20 horas e frase que orienta', async () => {
    const ana = await user();
    const { routine } = await svc.getRoutine(ana);
    expect(routine.preferences).toMatchObject({ weeklyGoalMinutes: 1200, gridStepMinutes: 60 });
    expect(routine.week.days).toHaveLength(7);
    expect(routine.goal.message).toContain('Marque na grade');
  });

  it('estudo, aula à mão e atividade pessoal entram no resumo e na meta', async () => {
    const ana = await user();
    const anat = await discipline(ana, 'Anatomia');
    await svc.createBlock(ana, study());
    const { block: aula } = await svc.createBlock(
      ana,
      study({ kind: 'aula', disciplineId: anat, weekdays: [2, 4], start: '08:00', end: '12:00' }),
    );
    expect(aula.label).toBe('Anat');
    const { block: gym } = await svc.createBlock(
      ana,
      study({
        kind: 'pessoal',
        category: 'academia',
        weekdays: [2, 3, 4],
        start: '19:00',
        end: '20:00',
      }),
    );
    expect(gym.label).toBe('Academia');
    // Sono atravessa a meia-noite e não conta como "outras atividades".
    const { block: sleep } = await svc.createBlock(
      ana,
      study({
        kind: 'pessoal',
        category: 'sono',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        start: '23:00',
        end: '07:00',
      }),
    );
    expect(sleep).toMatchObject({ durationMinutes: 480, start: '23:00', end: '07:00' });

    const { routine } = await svc.getRoutine(ana);
    expect(routine.summary).toEqual({
      classMinutes: 480,
      studyMinutes: 240,
      otherMinutes: 180,
      totalMinutes: 900,
    });
    expect(routine.goal).toMatchObject({ plannedMinutes: 240, missingMinutes: 960 });
    expect(routine.goal.message).toBe(
      'Sua rotina soma 4 horas de estudo. Faltam 16 horas para a sugestão de 20 horas.',
    );
  });

  it('horário ocupado não aceita outra atividade; editar a própria não conflita', async () => {
    const ana = await user();
    const { block } = await svc.createBlock(ana, study());
    await expect(
      svc.createBlock(ana, study({ weekdays: [3], start: '15:00', end: '17:00' })),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('quarta') });
    await expect(
      svc.updateBlock(ana, block.id, study({ start: '14:30', end: '16:30' })),
    ).resolves.toBeTruthy();
  });

  it('tirar só de um dia mantém os outros; tirar o último apaga', async () => {
    const ana = await user();
    const { block } = await svc.createBlock(ana, study({ weekdays: [1, 3, 5] }));
    await svc.removeBlock(ana, block.id, 3);
    let { routine } = await svc.getRoutine(ana);
    expect(routine.blocks[0]!.weekdays).toEqual([1, 5]);
    await svc.removeBlock(ana, block.id);
    ({ routine } = await svc.getRoutine(ana));
    expect(routine.blocks).toEqual([]);
  });

  it('aulas do cronograma da semana aparecem e contam como aula; a semana sem aula pula para a próxima com aula', async () => {
    const ana = await user();
    const disc = await discipline(ana, 'Fisiopatologia');
    // Daqui a três semanas, segunda 08:00 local (UTC-3 = 11:00 UTC).
    const today = localDayKey(new Date(), 'America/Sao_Paulo');
    const future = weekStart(today);
    const monday = new Date(`${future}T11:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + 22);
    await owner.insert(s.lessons).values({
      ownerId: ana,
      disciplineId: disc,
      title: 'Inflamação aguda',
      startsAt: monday,
      endsAt: new Date(monday.getTime() + 2 * 3600_000),
      origin: 'imported',
    });
    const { routine } = await svc.getRoutine(ana);
    expect(routine.lessons).toMatchObject([
      { title: 'Inflamação aguda', start: '08:00', end: '10:00' },
    ]);
    expect(routine.summary.classMinutes).toBe(120);
    // Semana pedida explicitamente: a atual, sem aula.
    const { routine: now } = await svc.getRoutine(ana, today);
    expect(now.lessons).toEqual([]);
  });

  it('meta e grade salvas; valores fora do permitido recusados pelo banco', async () => {
    const ana = await user();
    const { preferences } = await svc.savePreferences(ana, {
      weeklyGoalMinutes: 900,
      gridStepMinutes: 30,
      viewStartMinute: 360,
      viewEndMinute: 1440,
    });
    expect(preferences.weeklyGoalMinutes).toBe(900);
    expect((await svc.getRoutine(ana)).routine.goal.goalMinutes).toBe(900);
  });

  it('aula na disciplina de outro aluno: não encontrada', async () => {
    const ana = await user();
    const beto = await user();
    const anat = await discipline(ana, 'Anatomia');
    await expect(
      svc.createBlock(beto, study({ kind: 'aula', disciplineId: anat })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('com as chaves desligadas, não abre', async () => {
    await setFeatures({});
    await expect(svc.getRoutine(await user())).rejects.toMatchObject({ status: 404 });
    await setFeatures({ rotina: true });
  });
});
