import { randomUUID } from 'node:crypto';
import { and, createDb, createPool, eq, like, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as svc from './service';

// Faltas (SPEC v2, 5.12; plano, item 48).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function student() {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  const [t] = await owner
    .insert(s.studentTerms)
    .values({ ownerId: id, label: 'Atual' })
    .returning();
  const [d] = await owner
    .insert(s.enrolledDisciplines)
    .values({ ownerId: id, termId: t!.id, name: 'Fisiopatologia', color: 1 })
    .returning();
  return { id, disciplineId: d!.id };
}

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

const rule = {
  totalClassHours: 80,
  minAttendancePct: 75,
  classHoursPerMeeting: 2,
  weekdays: [1, 3],
  alertThresholds: [50, 75, 90],
};

beforeAll(() => setFeatures({ faltas: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('faltas', () => {
  it('sem regra: sem números; com a regra, o exemplo do documento', async () => {
    const { id, disciplineId } = await student();
    const empty = (await svc.getAttendance(id, disciplineId, '2026-11')).attendance;
    expect(empty.rule).toBeNull();
    expect(empty.summary).toBeNull();
    await svc.saveRule(id, disciplineId, rule);
    await svc.recordAbsence(id, disciplineId, {
      date: '2026-11-04',
      lessonId: null,
      classHours: 2,
      note: null,
    });
    const { attendance } = await svc.recordAbsence(id, disciplineId, {
      date: '2026-11-11',
      lessonId: null,
      classHours: 2,
      note: 'Consulta',
    });
    expect(attendance.summary).toMatchObject({
      limit: 20,
      registered: 4,
      remaining: 16,
      usedPct: 20,
    });
    // Sem cronograma, os dias vêm da configuração: segundas e quartas de novembro de 2026.
    expect(attendance.classDays.map((d) => d.date)).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-09',
      '2026-11-11',
      '2026-11-16',
      '2026-11-18',
      '2026-11-23',
      '2026-11-25',
      '2026-11-30',
    ]);
    expect(attendance.classDays.filter((d) => d.absenceId).map((d) => d.date)).toEqual([
      '2026-11-04',
      '2026-11-11',
    ]);
  });

  it('com cronograma, os dias são as aulas; registrar de novo atualiza (um por aula)', async () => {
    const { id, disciplineId } = await student();
    await svc.saveRule(id, disciplineId, { ...rule, weekdays: null });
    const [l] = await owner
      .insert(s.lessons)
      .values({
        ownerId: id,
        disciplineId,
        title: 'Inflamação aguda',
        startsAt: new Date('2026-08-10T11:00:00Z'),
        endsAt: new Date('2026-08-10T14:00:00Z'),
        classHours: '3',
        origin: 'imported',
      })
      .returning();
    const first = (await svc.getAttendance(id, disciplineId, '2026-08')).attendance;
    expect(first.classDays).toEqual([
      {
        date: '2026-08-10',
        lessonId: l!.id,
        title: 'Inflamação aguda',
        classHours: 3,
        absenceId: null,
      },
    ]);
    await svc.recordAbsence(id, disciplineId, {
      date: '2026-08-10',
      lessonId: l!.id,
      classHours: 3,
      note: null,
    });
    const { attendance } = await svc.recordAbsence(id, disciplineId, {
      date: '2026-08-10',
      lessonId: l!.id,
      classHours: 1.5,
      note: 'Saí no intervalo',
    });
    expect(attendance.absences).toMatchObject([
      { classHours: 1.5, note: 'Saí no intervalo', lessonTitle: 'Inflamação aguda' },
    ]);
    // A aula sai do cronograma; a falta fica (FAL-12).
    await owner.delete(s.lessons).where(eq(s.lessons.id, l!.id));
    const after = (await svc.getAttendance(id, disciplineId, '2026-08')).attendance;
    expect(after.absences).toHaveLength(1);
    expect(after.summary?.registered).toBe(1.5);
  });

  it('aviso ao chegar em 50% do limite; voltou abaixo, o aviso sai (FAL-07)', async () => {
    const { id, disciplineId } = await student();
    await svc.saveRule(id, disciplineId, rule);
    const notices = () =>
      owner
        .select()
        .from(s.notifications)
        .where(
          and(eq(s.notifications.ownerId, id), like(s.notifications.dedupeKey, 'attendance:%')),
        );
    const days = ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16'];
    let last;
    for (const date of days)
      last = await svc.recordAbsence(id, disciplineId, {
        date,
        lessonId: null,
        classHours: 2,
        note: null,
      });
    expect(last!.attendance.summary).toMatchObject({ usedPct: 50, status: 'atencao' });
    expect((await notices()).map((n) => n.title)).toEqual([
      'Faltas em Fisiopatologia: 50% do limite',
    ]);
    const absence = last!.attendance.absences[0]!;
    await svc.removeAbsence(id, disciplineId, absence.id);
    expect(await notices()).toEqual([]);
  });

  it('outro aluno não lê nem registra', async () => {
    const ana = await student();
    const beto = await student();
    await expect(svc.getAttendance(beto.id, ana.disciplineId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      svc.recordAbsence(beto.id, ana.disciplineId, {
        date: '2026-11-02',
        lessonId: null,
        classHours: 2,
        note: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
