import { randomUUID } from 'node:crypto';
import { addDays, localDayKey } from '@gutta/core';
import { and, createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import { getAgenda } from '@/features/agenda/service';
import { createAssessment, removeAssessment } from '@/features/calendar/service';
import * as notes from '@/features/notifications/service';
import * as svc from './service';

// Lembretes e avisos (SPEC v2, LEM-01 a LEM-15; plano, item 47).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
const TZ = 'America/Sao_Paulo';
const today = () => localDayKey(new Date(), TZ);

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
    .values({ ownerId: id, termId: t!.id, name: 'Anatomia', color: 2 })
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

const noticesOf = (userId: string) =>
  owner.select().from(s.notifications).where(eq(s.notifications.ownerId, userId));

const base = {
  title: 'Ler o capítulo 3',
  description: null,
  category: 'leitura' as const,
  disciplineId: null,
  start: '10:00',
  mode: 'lembrar' as const,
  durationMinutes: null,
  leadMinutes: 30,
};

beforeAll(() => setFeatures({ lembretes: true, agenda: true }));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('lembretes', () => {
  it('apenas lembrar: aviso na antecedência, aparece na agenda sem ocupar horário', async () => {
    const { id } = await student();
    const date = addDays(today(), 2);
    const { reminder } = await svc.createReminder(id, { ...base, date });
    expect(reminder).toMatchObject({ date, start: '10:00', mode: 'lembrar', done: false });
    const [n] = await noticesOf(id);
    expect(n).toMatchObject({ dedupeKey: `reminder:${reminder.id}`, type: 'reminder' });
    // 10:00 em São Paulo menos 30 min = 12:30 UTC.
    expect(n!.scheduledFor.toISOString()).toBe(`${date}T12:30:00.000Z`);
    const agenda = await getAgenda(id, { from: date, to: date });
    expect(agenda.items.map((i) => [i.source, i.title])).toEqual([
      ['reminder', 'Ler o capítulo 3'],
    ]);
  });

  it('reservar horário: cria o compromisso que ocupa o tempo, sem duplicar na agenda', async () => {
    const { id } = await student();
    const date = addDays(today(), 3);
    const { reminder } = await svc.createReminder(id, {
      ...base,
      title: 'Reunião do grupo',
      date,
      mode: 'reservar',
      durationMinutes: 90,
    });
    expect(reminder.calendarEventId).not.toBeNull();
    const agenda = await getAgenda(id, { from: date, to: date });
    expect(agenda.items.map((i) => [i.source, i.title, i.startLocal, i.endLocal])).toEqual([
      ['event', 'Reunião do grupo', '10:00', '11:30'],
    ]);
    // Voltar para "apenas lembrar" tira o compromisso; excluir tira tudo.
    await svc.updateReminder(id, reminder.id, { ...base, title: 'Reunião do grupo', date });
    expect(
      await owner.select().from(s.calendarEvents).where(eq(s.calendarEvents.ownerId, id)),
    ).toEqual([]);
    await svc.removeReminder(id, reminder.id);
    expect(await noticesOf(id)).toEqual([]);
  });

  it('feito tira o aviso; pendente de novo traz de volta', async () => {
    const { id } = await student();
    const { reminder } = await svc.createReminder(id, { ...base, date: addDays(today(), 1) });
    await svc.setReminderDone(id, reminder.id, true);
    expect(await noticesOf(id)).toEqual([]);
    expect((await svc.listReminders(id, 'feitos')).items).toHaveLength(1);
    await svc.setReminderDone(id, reminder.id, false);
    expect(await noticesOf(id)).toHaveLength(1);
  });

  it('mudar a hora recoloca o aviso como novo, inclusive para o e-mail', async () => {
    const { id } = await student();
    const { reminder } = await svc.createReminder(id, { ...base, date: today(), start: '00:00' });
    const key = `reminder:${reminder.id}`;
    await owner
      .update(s.notifications)
      .set({ readAt: new Date(), emailHandledAt: new Date() })
      .where(eq(s.notifications.dedupeKey, key));
    await svc.updateReminder(id, reminder.id, { ...base, date: addDays(today(), 5) });
    const [n] = await noticesOf(id);
    expect(n).toMatchObject({ readAt: null, emailHandledAt: null });
  });

  it('outro aluno não mexe; disciplina de outro é recusada', async () => {
    const ana = await student();
    const beto = await student();
    const { reminder } = await svc.createReminder(ana.id, { ...base, date: today() });
    await expect(svc.setReminderDone(beto.id, reminder.id, true)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      svc.createReminder(beto.id, { ...base, date: today(), disciplineId: ana.disciplineId }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('avisos', () => {
  it('só o que já chegou aparece; contador e "marcar tudo como lido"', async () => {
    const { id } = await student();
    await svc.createReminder(id, { ...base, date: today(), start: '00:00', leadMinutes: 0 });
    await svc.createReminder(id, { ...base, title: 'Futuro', date: addDays(today(), 10) });
    const list = await notes.listNotifications(id);
    expect(list.items.map((i) => i.title)).toEqual(['Ler o capítulo 3']);
    expect(list.unread).toBe(1);
    await notes.readAllNotifications(id);
    expect((await notes.listNotifications(id)).unread).toBe(0);
  });

  it('prova cadastrada gera aviso na véspera; excluída, o aviso sai; preferência desliga', async () => {
    const { id, disciplineId } = await student();
    const due = addDays(today(), 6);
    const { assessment } = await createAssessment(id, {
      disciplineId,
      kind: 'prova',
      name: 'P1',
      topicNote: null,
      date: due,
      start: '19:00',
    });
    const academic = async () =>
      owner
        .select()
        .from(s.notifications)
        .where(
          and(eq(s.notifications.ownerId, id), eq(s.notifications.type, 'academic_assessment')),
        );
    const [n] = await academic();
    expect(n!.title).toBe('Prova de Anatomia amanhã às 19:00');
    expect(n!.scheduledFor.toISOString()).toBe(`${addDays(due, -1)}T12:00:00.000Z`);
    await notes.savePreferences(id, {
      emailEnabled: true,
      quietFrom: '22:00',
      quietUntil: '07:00',
      dailyCap: 5,
      academicAlerts: false,
    });
    expect(await academic()).toEqual([]);
    await notes.savePreferences(id, {
      emailEnabled: true,
      quietFrom: null,
      quietUntil: null,
      dailyCap: 5,
      academicAlerts: true,
    });
    expect(await academic()).toHaveLength(1);
    await removeAssessment(id, assessment.id);
    expect(await academic()).toEqual([]);
    expect((await notes.getPreferences(id)).preferences).toMatchObject({ emailEnabled: true });
  });
});
