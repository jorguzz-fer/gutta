import { randomUUID } from 'node:crypto';
import { diffSchedule } from '@gutta/core';
import { createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import { getAgenda } from '@/features/agenda/service';
import * as svc from './service';

// Calendário (SPEC v2, CAL-02 a CAL-07, CAL-16; plano, item 46).
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

const monitoria = {
  kind: 'compromisso' as const,
  title: 'Monitoria',
  notes: null,
  disciplineId: null,
  color: null,
  blocksTime: true,
  // Terças de agosto de 2026: 4, 11, 18, 25.
  recurrence: { freq: 'weekly' as const, weekdays: [2], until: '2026-08-31' },
  date: '2026-08-04',
  start: '10:00',
  end: '11:00',
};
const august = { from: '2026-08-01', to: '2026-08-31' };
const titles = async (userId: string) =>
  (await getAgenda(userId, august)).items
    .filter((i) => i.source === 'event')
    .map((i) => [i.date, i.startLocal, i.title]);

beforeAll(() => setFeatures({ agenda: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('compromissos que se repetem (CAL-04)', () => {
  it('cria a série e aparece na agenda em cada ocorrência', async () => {
    const { id } = await student();
    await svc.createEvent(id, monitoria);
    expect(await titles(id)).toEqual([
      ['2026-08-04', '10:00', 'Monitoria'],
      ['2026-08-11', '10:00', 'Monitoria'],
      ['2026-08-18', '10:00', 'Monitoria'],
      ['2026-08-25', '10:00', 'Monitoria'],
    ]);
  });

  it('só esta: muda o horário de uma ocorrência; excluir só esta tira uma', async () => {
    const { id } = await student();
    const { event } = await svc.createEvent(id, monitoria);
    await svc.updateEvent(id, event.id, {
      scope: 'this',
      occurrenceDate: '2026-08-11',
      event: {
        ...monitoria,
        date: '2026-08-12',
        start: '14:00',
        end: '15:00',
        title: 'Monitoria extra',
      },
    });
    await svc.removeEvent(id, event.id, 'this', '2026-08-18');
    expect(await titles(id)).toEqual([
      ['2026-08-04', '10:00', 'Monitoria'],
      ['2026-08-12', '14:00', 'Monitoria extra'],
      ['2026-08-25', '10:00', 'Monitoria'],
    ]);
  });

  it('esta e as próximas: divide a série sem perder nem repetir ocorrência', async () => {
    const { id } = await student();
    const { event } = await svc.createEvent(id, monitoria);
    const res = await svc.updateEvent(id, event.id, {
      scope: 'following',
      occurrenceDate: '2026-08-18',
      event: { ...monitoria, date: '2026-08-18', start: '16:00', end: '17:00' },
    });
    expect(res.event.id).not.toBe(event.id);
    expect(await titles(id)).toEqual([
      ['2026-08-04', '10:00', 'Monitoria'],
      ['2026-08-11', '10:00', 'Monitoria'],
      ['2026-08-18', '16:00', 'Monitoria'],
      ['2026-08-25', '16:00', 'Monitoria'],
    ]);
  });

  it('toda a série muda tudo; excluir esta e as próximas encerra na véspera', async () => {
    const { id } = await student();
    const { event } = await svc.createEvent(id, monitoria);
    await svc.updateEvent(id, event.id, {
      scope: 'all',
      event: { ...monitoria, title: 'Monitoria de Fisio' },
    });
    await svc.removeEvent(id, event.id, 'following', '2026-08-18');
    expect(await titles(id)).toEqual([
      ['2026-08-04', '10:00', 'Monitoria de Fisio'],
      ['2026-08-11', '10:00', 'Monitoria de Fisio'],
    ]);
  });

  it('data que não é da série é recusada', async () => {
    const { id } = await student();
    const { event } = await svc.createEvent(id, monitoria);
    await expect(svc.removeEvent(id, event.id, 'this', '2026-08-05')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('outro aluno não altera nem exclui', async () => {
    const ana = await student();
    const beto = await student();
    const { event } = await svc.createEvent(ana.id, monitoria);
    await expect(svc.removeEvent(beto.id, event.id, 'all')).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.createEvent(beto.id, { ...monitoria, disciplineId: ana.disciplineId }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('aulas e avaliações no calendário (CAL-06, CAL-07, CAL-16)', () => {
  it('aula importada editada fica marcada; tirada da agenda não volta com o cronograma', async () => {
    const { id, disciplineId } = await student();
    const original = {
      date: '2026-08-10',
      start: '08:00',
      end: '10:00',
      type: 'aula' as const,
      title: 'Inflamação aguda',
      topic: null,
      teacher: null,
      location: null,
    };
    const [l] = await owner
      .insert(s.lessons)
      .values({
        ownerId: id,
        disciplineId,
        title: 'Inflamação aguda',
        startsAt: new Date('2026-08-10T11:00:00Z'),
        endsAt: new Date('2026-08-10T13:00:00Z'),
        origin: 'imported',
        original,
      })
      .returning();
    const { lesson } = await svc.updateLesson(id, l!.id, {
      disciplineId,
      kind: 'aula',
      title: 'Inflamação aguda',
      location: 'Auditório',
      date: '2026-08-10',
      start: '09:00',
      end: '11:00',
    });
    expect(lesson).toMatchObject({
      modifiedByStudent: true,
      start: '09:00',
      location: 'Auditório',
    });
    expect(lesson.original).toMatchObject({ start: '08:00' });

    await svc.removeLesson(id, l!.id);
    expect((await getAgenda(id, august)).items.filter((i) => i.source === 'lesson')).toEqual([]);
    // O mesmo item num cronograma novo: aparece como "mantido pelo aluno", não como novo.
    const row = await owner.query.lessons.findFirst({ where: eq(s.lessons.id, l!.id) });
    const diff = diffSchedule(
      [{ id: row!.id, table: 'lesson', original, modifiedByStudent: row!.cancelledAt !== null }],
      [original],
    );
    expect(diff.added).toEqual([]);
  });

  it('aula criada à mão é apagada de verdade; prova do calendário é a mesma da agenda', async () => {
    const { id, disciplineId } = await student();
    const { lesson } = await svc.createLesson(id, {
      disciplineId,
      kind: 'pratica',
      title: 'Laboratório',
      location: null,
      date: '2026-08-12',
      start: '14:00',
      end: '17:00',
    });
    expect(lesson.origin).toBe('manual');
    const { assessment } = await svc.createAssessment(id, {
      disciplineId,
      kind: 'prova',
      name: 'P1',
      topicNote: 'Inflamação e reparo',
      date: '2026-08-20',
      start: '19:00',
    });
    const items = (await getAgenda(id, august)).items;
    expect(items.map((i) => [i.source, i.title])).toEqual([
      ['lesson', 'Laboratório'],
      ['assessment', 'P1'],
    ]);
    await svc.updateAssessment(id, assessment.id, {
      disciplineId,
      kind: 'prova',
      name: 'P1',
      topicNote: null,
      date: '2026-08-21',
      start: null,
    });
    await svc.removeLesson(id, lesson.id);
    expect(
      await owner.query.lessons.findFirst({ where: eq(s.lessons.id, lesson.id) }),
    ).toBeUndefined();
    const after = (await getAgenda(id, august)).items;
    expect(after.map((i) => [i.title, i.date, i.allDay])).toEqual([['P1', '2026-08-21', true]]);
  });
});
