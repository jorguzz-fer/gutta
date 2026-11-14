import { randomUUID } from 'node:crypto';
import { addDays, localDayKey, weekStart, zonedTimeToUtc } from '@gutta/core';
import { and, createDb, createPool, eq, schema as s } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import { getAgendaWeek } from '@/features/agenda/service';
import { saveProgress } from '@/features/lesson-study/service';
import { createBlock } from '@/features/routine/service';
import * as svc from './service';

// Equilíbrio (SPEC v2, 5.4 e 7.5; plano, item 58).
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
const TZ = 'America/Sao_Paulo';
const at = (day: string, h: number, m = 0) => zonedTimeToUtc(day, TZ, h, m);
// A semana que vem, inteira no futuro.
const NEXT = weekStart(addDays(localDayKey(new Date(), TZ), 7));
const day = (n: number) => addDays(NEXT, n);

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

async function student(withWindows = true) {
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
    .values({ ownerId: id, termId: t!.id, name: 'BMF', color: 1 })
    .returning();
  if (withWindows)
    await createBlock(id, {
      kind: 'estudo',
      category: null,
      label: null,
      disciplineId: null,
      color: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      start: '19:00',
      end: '21:00',
    });
  return { id, disciplineId: d!.id };
}

const ALL = { equilibrio: true, rotina: true, agenda: true, meu_espaco: true, aula: true };
beforeAll(() => setFeatures(ALL));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('proposta e confirmação (EQU-06, EQU-07)', () => {
  it('propõe só nas janelas, antes da prova, e nada entra na agenda antes de aceitar', async () => {
    const a = await student();
    const [prova] = await owner
      .insert(s.assessments)
      .values({
        ownerId: a.id,
        disciplineId: a.disciplineId,
        name: 'P1',
        kind: 'prova',
        dueAt: at(day(4), 8),
      })
      .returning();
    const task = await svc.createRequest(a.id, { kind: 'prova', id: prova!.id });
    expect(task).toMatchObject({ origin: 'prova', estimatedMinutes: 120, importance: 'alta' });
    // O mesmo pedido de novo: a mesma tarefa (EQU-18).
    expect((await svc.createRequest(a.id, { kind: 'prova', id: prova!.id })).id).toBe(task.id);

    const p = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    expect(p.status).toBe('proposed');
    expect(p.sessions.length).toBe(4);
    for (const x of p.sessions) {
      expect(x.startLocal >= '19:00' && x.endLocal <= '21:00').toBe(true);
      expect(new Date(x.end).getTime()).toBeLessThanOrEqual(at(day(4), 8).getTime());
      expect(x.reasons[0]).toMatch(/^P1 de BMF n[ao] /);
    }
    const agendaBefore = await getAgendaWeek(a.id, NEXT);
    expect(agendaBefore.items.filter((i) => i.source === 'session')).toEqual([]);

    // Aceita em parte.
    const accept = p.sessions.slice(0, 2).map((x) => x.id);
    const r = await svc.decideProposal(a.id, p.id, { accept });
    expect(r).toEqual({ status: 'partly_accepted', confirmed: 2 });
    // Repetição da mesma decisão não muda nada.
    expect(await svc.decideProposal(a.id, p.id, { accept })).toEqual(r);
    const agenda = await getAgendaWeek(a.id, NEXT);
    expect(agenda.items.filter((i) => i.source === 'session')).toHaveLength(2);

    const week = await svc.getWeek(a.id, NEXT);
    expect(week.indicators).toEqual({
      availableMinutes: 7 * 120,
      plannedMinutes: 60,
      doneMinutes: 0,
    });
    expect(week.proposal).toBeNull();
    // Os 60 minutos que ficaram de fora voltam na próxima proposta, sem duplicar os confirmados.
    const p2 = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    expect(p2.sessions.reduce((n, x) => n + x.minutes, 0)).toBe(60);
    for (const x of p2.sessions)
      for (const c of week.sessions) expect(x.start >= c.end || x.end <= c.start).toBe(true);
  });

  it('sem janela de estudo, nada é proposto e a tarefa aparece como não coube (EQU-09)', async () => {
    const a = await student(false);
    await svc.createTask(a.id, {
      title: 'Ler capítulo',
      disciplineId: a.disciplineId,
      estimatedMinutes: 60,
      dueDate: null,
      difficulty: null,
      importance: null,
    });
    const p = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    expect(p.sessions).toEqual([]);
    expect(p.unplaced).toMatchObject([{ title: 'Ler capítulo', minutes: 60 }]);
    const week = await svc.getWeek(a.id, NEXT);
    expect(week.hasStudyWindows).toBe(false);
    expect(week.balance.state).toBe('revisar');
    // Recusar tudo.
    expect(await svc.decideProposal(a.id, p.id, { accept: [] })).toEqual({
      status: 'rejected',
      confirmed: 0,
    });
  });

  it('editar uma sessão: não vai para cima de aula; outro horário funciona (EQU-07)', async () => {
    const a = await student();
    await owner.insert(s.lessons).values({
      ownerId: a.id,
      disciplineId: a.disciplineId,
      title: 'Aula de BMF',
      startsAt: at(day(2), 14),
      endsAt: at(day(2), 16),
    });
    await svc.createTask(a.id, {
      title: 'Exercícios',
      disciplineId: a.disciplineId,
      estimatedMinutes: 30,
      dueDate: null,
      difficulty: null,
      importance: null,
    });
    const p = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    const x = p.sessions[0]!;
    await expect(
      svc.updateSession(a.id, x.id, { date: day(2), start: '15:00' }),
    ).rejects.toMatchObject({ status: 409 });
    const moved = await svc.updateSession(a.id, x.id, {
      date: day(2),
      start: '17:00',
      minutes: 45,
    });
    expect(moved).toMatchObject({ date: day(2), startLocal: '17:00', endLocal: '17:45' });
  });
});

describe('registro e replanejamento (EQU-11, EQU-12, EQU-14)', () => {
  it('feita conta no realizado e conclui a tarefa; desfazer reabre', async () => {
    const a = await student();
    const t = await svc.createTask(a.id, {
      title: 'Resumo',
      disciplineId: a.disciplineId,
      estimatedMinutes: 30,
      dueDate: null,
      difficulty: null,
      importance: null,
    });
    const p = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    await svc.decideProposal(a.id, p.id, { accept: p.sessions.map((x) => x.id) });
    const [x] = (await svc.getWeek(a.id, NEXT)).sessions;
    await expect(svc.markSession(a.id, x!.id, { status: 'partly_done' })).rejects.toMatchObject({
      status: 400,
    });
    await svc.markSession(a.id, x!.id, { status: 'done' });
    let tasks = await svc.listTasks(a.id, {});
    expect(tasks.items.find((i) => i.id === t.id)).toMatchObject({
      status: 'concluida',
      doneMinutes: 30,
    });
    expect((await svc.getWeek(a.id, NEXT)).indicators.doneMinutes).toBe(30);
    await svc.markSession(a.id, x!.id, { status: 'confirmed' });
    tasks = await svc.listTasks(a.id, {});
    expect(tasks.items.find((i) => i.id === t.id)).toMatchObject({
      status: 'pendente',
      doneMinutes: 0,
    });
  });

  it('sessão que ficou para trás não se move sozinha; replanejar não aumenta o total', async () => {
    const a = await student();
    const t = await svc.createTask(a.id, {
      title: 'Revisar fisiologia',
      disciplineId: a.disciplineId,
      estimatedMinutes: 60,
      dueDate: null,
      difficulty: 'dificil',
      importance: null,
    });
    // Duas sessões confirmadas ontem, sem registro.
    const y = new Date(Date.now() - 24 * 3_600_000);
    const [s1, s2] = await owner
      .insert(s.studySessions)
      .values(
        [0, 40].map((m) => ({
          ownerId: a.id,
          taskId: t.id,
          disciplineId: a.disciplineId,
          title: 'Revisar fisiologia',
          startsAt: new Date(y.getTime() + m * 60_000),
          endsAt: new Date(y.getTime() + (m + 30) * 60_000),
          status: 'confirmed' as const,
        })),
      )
      .returning();
    const week = await svc.getWeek(a.id, NEXT);
    expect(week.behind.map((x) => x.id).sort()).toEqual([s1!.id, s2!.id].sort());
    // Ela não volta sozinha numa proposta nova (EQU-14).
    const plain = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    expect(plain.sessions).toEqual([]);

    const r = await svc.createProposal(a.id, {
      semana: NEXT,
      kind: 'replanejar',
      sessionIds: [s1!.id, s2!.id],
    });
    expect(r.kind).toBe('replanejar');
    expect(r.sessions.reduce((n, x) => n + x.minutes, 0)).toBeLessThanOrEqual(60);
    await svc.decideProposal(a.id, r.id, {
      accept: r.sessions.map((x) => x.id),
      reason: 'Plantão',
    });
    const old = await owner
      .select()
      .from(s.studySessions)
      .where(and(eq(s.studySessions.ownerId, a.id), eq(s.studySessions.id, s1!.id)));
    expect(old[0]).toMatchObject({ status: 'rescheduled', rescheduleReason: 'Plantão' });
    expect((await svc.getWeek(a.id, NEXT)).behind).toEqual([]);
  });

  it('concluir aula pedindo revisão vira tarefa do Equilíbrio (AUL-22, EQU-18)', async () => {
    const a = await student();
    const [l] = await owner
      .insert(s.lessons)
      .values({
        ownerId: a.id,
        disciplineId: a.disciplineId,
        title: 'Inflamação',
        startsAt: new Date(Date.now() - 3 * 3_600_000),
      })
      .returning();
    await saveProgress(a.id, l!.id, {
      concluded: true,
      wantsReview: true,
      overallDifficulty: 'dificil',
    });
    const tasks = await svc.listTasks(a.id, { status: 'pendente' });
    expect(tasks.items).toMatchObject([
      { title: 'Revisão: Inflamação', origin: 'aula', difficulty: 'dificil', estimatedMinutes: 30 },
    ]);
  });
});

describe('isolamento e chave', () => {
  it('outro aluno não decide, edita, registra nem pede com o que é de outro', async () => {
    const a = await student();
    const b = await student();
    await svc.createTask(a.id, {
      title: 'X',
      disciplineId: a.disciplineId,
      estimatedMinutes: 30,
      dueDate: null,
      difficulty: null,
      importance: null,
    });
    const p = await svc.createProposal(a.id, { semana: NEXT, kind: 'semana' });
    const x = p.sessions[0]!;
    await expect(svc.decideProposal(b.id, p.id, { accept: [x.id] })).rejects.toMatchObject({
      status: 404,
    });
    await expect(svc.updateSession(b.id, x.id, { start: '20:00' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(svc.markSession(b.id, x.id, { status: 'done' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      svc.createTask(b.id, {
        title: 'Y',
        disciplineId: a.disciplineId,
        estimatedMinutes: 30,
        dueDate: null,
        difficulty: null,
        importance: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await svc.listTasks(b.id, {})).items).toEqual([]);
    // Recusa de A: só a sessão dele estava na proposta.
    expect((await svc.decideProposal(a.id, p.id, { accept: [] })).status).toBe('rejected');
  });

  it('semana intensa com duas provas em sete dias (EQU-16, 6.4)', async () => {
    const a = await student();
    await owner.insert(s.assessments).values(
      [1, 3].map((n) => ({
        ownerId: a.id,
        disciplineId: a.disciplineId,
        name: `P${n}`,
        kind: 'prova' as const,
        dueAt: at(day(n), 8),
      })),
    );
    expect((await svc.getWeek(a.id, NEXT)).balance.state).toBe('intensa');
  });

  it('desligado pela chave, responde como inexistente', async () => {
    const a = await student();
    await setFeatures({ ...ALL, equilibrio: false });
    await expect(svc.getWeek(a.id)).rejects.toMatchObject({ status: 404 });
    await setFeatures(ALL);
  });
});
