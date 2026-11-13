import { randomUUID } from 'node:crypto';
import { addDays, localDayKey, weekStart, zonedTimeToUtc } from '@gutta/core';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import { getAgenda, getAgendaWeek } from '@/features/agenda/service';
import { createBlock } from '@/features/routine/service';
import { changeMainGoal, loadSpace } from './service';

// Agenda geral (CAL-14) e Meu Espaço inicial (ESP-01 a ESP-06, ESP-09, ESP-13; plano, item 44).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
const TZ = 'America/Sao_Paulo';

async function student() {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Hugo Santos' });
  const course = await owner.query.courses.findFirst({ where: eq(s.courses.slug, 'medicina') });
  await owner.insert(s.studentProfiles).values({
    userId: id,
    courseId: course!.id,
    semester: 3,
    campus: 'Central',
    classGroup: 'XIIA',
    mainGoal: 'reforcar_disciplinas',
    onboardingCompletedAt: new Date(),
  });
  const [t] = await owner
    .insert(s.studentTerms)
    .values({ ownerId: id, label: 'Atual' })
    .returning();
  const [d] = await owner
    .insert(s.enrolledDisciplines)
    .values({
      ownerId: id,
      termId: t!.id,
      name: 'Fisiopatologia',
      shortName: 'Fisiopato',
      color: 1,
    })
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

const today = () => localDayKey(new Date(), TZ);
const at = (day: string, h: number, m = 0) => zonedTimeToUtc(day, TZ, h, m);

beforeAll(() => setFeatures({ agenda: true, meu_espaco: true, rotina: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('agenda geral', () => {
  it('aulas, avaliações e rotina na mesma lista, em ordem, sem duplicar', async () => {
    const { id, disciplineId } = await student();
    const monday = addDays(weekStart(today()), 8);
    await owner.insert(s.lessons).values({
      ownerId: id,
      disciplineId,
      title: 'Inflamação aguda',
      startsAt: at(monday, 8),
      endsAt: at(monday, 10),
      origin: 'imported',
    });
    await owner.insert(s.assessments).values({
      ownerId: id,
      disciplineId,
      kind: 'prova',
      name: 'P1',
      dueAt: at(addDays(monday, 3), 19),
    });
    await owner.insert(s.assessments).values({
      ownerId: id,
      disciplineId,
      kind: 'entrega',
      name: 'Relatório',
      dueAt: at(addDays(monday, 4), 0),
      allDay: true,
    });
    await createBlock(id, {
      kind: 'pessoal',
      category: 'academia',
      label: null,
      disciplineId: null,
      color: null,
      weekdays: [1],
      start: '19:00',
      end: '20:00',
    });
    const week = await getAgendaWeek(id, monday);
    expect(week.days[0]).toBe(addDays(monday, -1));
    expect(week.items.map((i) => [i.date, i.kind, i.title, i.startLocal])).toEqual([
      [monday, 'aula', 'Inflamação aguda', '08:00'],
      [monday, 'pessoal', 'Academia', '19:00'],
      [addDays(monday, 3), 'prova', 'P1', '19:00'],
      [addDays(monday, 4), 'entrega', 'Relatório', null],
    ]);
    expect(week.items[0]).toMatchObject({ protected: true, endLocal: '10:00' });

    const range = await getAgenda(id, { from: monday, to: monday });
    expect(range.items).toHaveLength(2);
    await expect(getAgenda(id, { from: monday, to: addDays(monday, 90) })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('outro aluno não vê nada', async () => {
    const ana = await student();
    const beto = await student();
    await createBlock(ana.id, {
      kind: 'estudo',
      category: null,
      label: null,
      disciplineId: null,
      color: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      start: '10:00',
      end: '11:00',
    });
    expect((await getAgendaWeek(beto.id, null)).items).toEqual([]);
  });
});

describe('Meu Espaço', () => {
  it('cabeçalho, disciplinas e estados vazios sem número inventado', async () => {
    const { id } = await student();
    const space = await loadSpace(id);
    expect(space.greetingName).toBe('Hugo');
    expect(space.profile).toMatchObject({
      course: 'Medicina',
      semester: 3,
      campus: 'Central',
      classGroup: 'XIIA',
      mainGoalLabel: 'Reforçar disciplinas',
    });
    expect(space.disciplines).toHaveLength(1);
    expect(space.disciplines[0]!.lessons).toEqual({ total: 0, past: 0 });
    expect(space.routine.hasBlocks).toBe(false);
    expect(space.routine.sleepDailyMinutes).toBeNull();
    expect(space.todayItems).toEqual([]);
    expect(space.upcoming).toEqual([]);
  });

  it('dia de hoje, próximos compromissos, aulas já ocorridas e descanso registrado', async () => {
    const { id, disciplineId } = await student();
    const t = today();
    await owner.insert(s.lessons).values([
      {
        ownerId: id,
        disciplineId,
        title: 'Aula passada',
        startsAt: at(addDays(t, -7), 8),
        endsAt: at(addDays(t, -7), 10),
        origin: 'imported',
      },
      {
        ownerId: id,
        disciplineId,
        title: 'Aula futura',
        startsAt: at(addDays(t, 7), 8),
        endsAt: at(addDays(t, 7), 10),
        origin: 'imported',
      },
      {
        ownerId: id,
        disciplineId,
        kind: 'pratica',
        title: 'Laboratório',
        startsAt: at(addDays(t, 2), 14),
        endsAt: at(addDays(t, 2), 17),
        origin: 'imported',
      },
    ]);
    await owner.insert(s.assessments).values({
      ownerId: id,
      disciplineId,
      kind: 'prova',
      name: 'P1',
      dueAt: at(addDays(t, 5), 19),
    });
    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    await createBlock(id, {
      kind: 'pessoal',
      category: 'sono',
      label: null,
      disciplineId: null,
      color: null,
      weekdays: everyDay,
      start: '23:00',
      end: '07:00',
    });
    await createBlock(id, {
      kind: 'estudo',
      category: null,
      label: null,
      disciplineId: null,
      color: null,
      weekdays: everyDay,
      start: '14:00',
      end: '15:00',
    });
    const space = await loadSpace(id);
    expect(space.disciplines[0]!.lessons).toEqual({ total: 2, past: 1 });
    expect(space.upcoming.map((u) => u.title)).toEqual(['Laboratório', 'P1']);
    expect(space.todayItems.map((i) => i.title)).toContain('Estudo');
    expect(space.routine.hasBlocks).toBe(true);
    expect(space.routine.goal.plannedMinutes).toBe(7 * 60);
    // Sono das 23:00 às 07:00 todos os dias: 8 h por dia em média.
    expect(space.routine.sleepDailyMinutes).toBe(480);
  });

  it('alterar objetivo aceita só as opções', async () => {
    const { id } = await student();
    expect(await changeMainGoal(id, 'organizar_rotina')).toBe(true);
    expect((await loadSpace(id)).profile.mainGoalLabel).toBe('Organizar minha rotina');
    expect(await changeMainGoal(id, 'qualquer')).toBe(false);
  });
});
