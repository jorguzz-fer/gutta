import { randomUUID } from 'node:crypto';
import { and, createDb, createPool, eq, schema as s, sql } from '@gutta/db';
import type { ScheduleItem } from '@gutta/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import * as academics from '@/features/academics/service';
import * as svc from './service';

// Conferência do cronograma (SPEC v2, DIS-05 e DIS-07; plano, item 41). O worker é simulado:
// o teste grava direto o que a IA teria lido.
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);

async function user(consent = true) {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  if (consent)
    await owner
      .insert(s.consentRecords)
      .values({ userId: id, purpose: 'ai_materials', granted: true, policyVersion: 'teste' });
  return id;
}

async function file(ownerId: string, status: 'scanning' | 'ready' = 'ready') {
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId,
      originalName: 'cronograma.pdf',
      mime: 'application/pdf',
      sizeBytes: 1000,
      sha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      status,
    })
    .returning();
  return f!.id;
}

const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  date: '2026-08-10',
  start: '08:00',
  end: '10:00',
  type: 'aula',
  title: 'Inflamação aguda',
  topic: 'Inflamação',
  teacher: 'Dra. Juliana',
  location: 'Sala 3',
  ...over,
});
const extracted = (items: ScheduleItem[]) => ({
  discipline: null,
  warnings: [],
  events: items.map((i) => ({ ...i, confidence: 'alta', source: i.title, note: null })),
});

/** Disciplina com cronograma anexado; a leitura "termina" com estes itens. */
async function withReadyImport(userId: string, items: ScheduleItem[], disciplineId?: string) {
  const id =
    disciplineId ??
    (
      await academics.createDiscipline(userId, {
        name: `Fisiopatologia ${randomUUID().slice(0, 4)}`,
        shortName: null,
        color: 1,
        teachers: ['Dra. Juliana'],
      })
    ).discipline.id;
  const fileId = await file(userId);
  const { discipline } = await academics.attachDocument(userId, id, { kind: 'cronograma', fileId });
  const importId = discipline.scheduleImport!.id;
  await owner
    .update(s.scheduleImports)
    .set({ status: 'ready', extracted: extracted(items) })
    .where(eq(s.scheduleImports.id, importId));
  return { disciplineId: id, importId, fileId };
}

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

beforeAll(async () => {
  await setFeatures({ disciplinas: true });
});
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('anexar o cronograma', () => {
  it('arquivo pronto e autorização dada: leitura na fila', async () => {
    const ana = await user();
    const { discipline } = await academics.createDiscipline(ana, {
      name: 'Anatomia',
      shortName: null,
      color: 2,
      teachers: [],
    });
    const fileId = await file(ana);
    const res = await academics.attachDocument(ana, discipline.id, { kind: 'cronograma', fileId });
    expect(res.discipline.scheduleImport).toMatchObject({ status: 'extracting' });
    const [ev] = await owner
      .select()
      .from(s.outbox)
      .where(
        and(
          eq(s.outbox.topic, 'ai.extract_schedule'),
          sql`${s.outbox.payload}->>'importId' = ${res.discipline.scheduleImport!.id}`,
        ),
      );
    expect(ev?.payload).toEqual({ importId: res.discipline.scheduleImport!.id, userId: ana });
  });

  it('arquivo ainda processando: espera o arquivo', async () => {
    const ana = await user();
    const { discipline } = await academics.createDiscipline(ana, {
      name: 'Anatomia',
      shortName: null,
      color: 2,
      teachers: [],
    });
    const fileId = await file(ana, 'scanning');
    const res = await academics.attachDocument(ana, discipline.id, { kind: 'cronograma', fileId });
    expect(res.discipline.scheduleImport?.status).toBe('waiting_file');
  });

  it('sem autorização: pede; autorizando, a leitura vai para a fila', async () => {
    const caio = await user(false);
    const { discipline } = await academics.createDiscipline(caio, {
      name: 'Histologia',
      shortName: null,
      color: 3,
      teachers: [],
    });
    const fileId = await file(caio);
    const res = await academics.attachDocument(caio, discipline.id, {
      kind: 'cronograma',
      fileId,
    });
    const imp = res.discipline.scheduleImport!;
    expect(imp.status).toBe('needs_consent');
    const retried = await svc.retryImport(caio, imp.id, { grantConsent: true });
    expect(retried.import.status).toBe('extracting');
    const consents = await owner
      .select()
      .from(s.consentRecords)
      .where(eq(s.consentRecords.userId, caio));
    expect(consents.map((c) => [c.purpose, c.granted])).toEqual([['ai_materials', true]]);
  });

  it('plano de ensino não dispara leitura de cronograma', async () => {
    const ana = await user();
    const { discipline } = await academics.createDiscipline(ana, {
      name: 'Bioquímica',
      shortName: null,
      color: 4,
      teachers: [],
    });
    const res = await academics.attachDocument(ana, discipline.id, {
      kind: 'plano_ensino',
      fileId: await file(ana),
    });
    expect(res.discipline.scheduleImport).toBeNull();
  });
});

describe('conferir e confirmar', () => {
  it('tela de conferência recebe os itens; nada entra na agenda antes de confirmar', async () => {
    const ana = await user();
    const { importId } = await withReadyImport(ana, [item(), item({ type: 'prova', title: 'P1' })]);
    const { import: dto } = await svc.getImport(ana, importId);
    expect(dto.status).toBe('ready');
    expect(dto.items?.map((i) => i.title)).toEqual(['Inflamação aguda', 'P1']);
    expect(await owner.select().from(s.lessons).where(eq(s.lessons.ownerId, ana))).toEqual([]);
  });

  it('confirma: aulas e avaliações no fuso do aluno, docente e tema reaproveitados', async () => {
    const ana = await user();
    const { importId, disciplineId } = await withReadyImport(ana, [
      item(),
      item({ date: '2026-08-12', start: null, end: null, type: 'pratica', title: 'Laboratório' }),
      item({ date: '2026-09-14', start: '19:00', end: null, type: 'prova', title: 'P1' }),
    ]);
    const res = await svc.confirmImport(ana, importId, [
      item({ teacher: 'dra. juliana' }),
      item({ date: '2026-08-12', start: null, end: null, type: 'pratica', title: 'Laboratório' }),
      item({ date: '2026-09-14', start: '19:00', end: null, type: 'prova', title: 'P1' }),
    ]);
    expect(res.result).toEqual({ added: 3, changed: 0, removed: 0, kept: 0 });
    expect(res.import.status).toBe('confirmed');

    const lessons = await owner
      .select()
      .from(s.lessons)
      .where(eq(s.lessons.disciplineId, disciplineId))
      .orderBy(s.lessons.startsAt);
    // São Paulo é UTC-3: 08:00 local = 11:00 UTC.
    expect(lessons[0]).toMatchObject({
      kind: 'aula',
      origin: 'imported',
      allDay: false,
      location: 'Sala 3',
      importId,
    });
    expect(lessons[0]!.startsAt.toISOString()).toBe('2026-08-10T11:00:00.000Z');
    expect(lessons[0]!.endsAt!.toISOString()).toBe('2026-08-10T13:00:00.000Z');
    expect(lessons[1]).toMatchObject({ kind: 'pratica', allDay: true, endsAt: null });
    const teachers = await owner
      .select()
      .from(s.disciplineTeachers)
      .where(eq(s.disciplineTeachers.disciplineId, disciplineId));
    expect(teachers.map((t) => t.name)).toEqual(['Dra. Juliana']);
    expect(lessons[0]!.teacherId).toBe(teachers[0]!.id);
    const [p1] = await owner
      .select()
      .from(s.assessments)
      .where(eq(s.assessments.disciplineId, disciplineId));
    expect(p1).toMatchObject({ kind: 'prova', name: 'P1', allDay: false, origin: 'imported' });
    expect(p1!.dueAt!.toISOString()).toBe('2026-09-14T22:00:00.000Z');

    // Confirmar de novo (clique duplo, nova tentativa da rede) não duplica.
    const again = await svc.confirmImport(ana, importId, [item()]);
    expect(again.result).toEqual(res.result);
    expect(
      await owner.select().from(s.lessons).where(eq(s.lessons.disciplineId, disciplineId)),
    ).toHaveLength(2);
  });

  it('item com horário inválido não confirma', async () => {
    const ana = await user();
    const { importId } = await withReadyImport(ana, [item()]);
    await expect(
      svc.confirmImport(ana, importId, [item({ start: '10:00', end: '09:00' })]),
    ).rejects.toMatchObject({ status: 400 });
    expect((await svc.getImport(ana, importId)).import.status).toBe('ready');
  });

  it('descartar: nada muda na agenda e não dá mais para confirmar', async () => {
    const ana = await user();
    const { importId } = await withReadyImport(ana, [item()]);
    expect((await svc.rejectImport(ana, importId)).import.status).toBe('rejected');
    await expect(svc.confirmImport(ana, importId, [item()])).rejects.toMatchObject({
      status: 409,
    });
  });

  it('outro aluno não lê nem confirma', async () => {
    const ana = await user();
    const beto = await user();
    const { importId } = await withReadyImport(ana, [item()]);
    await expect(svc.getImport(beto, importId)).rejects.toMatchObject({ status: 404 });
    await expect(svc.confirmImport(beto, importId, [item()])).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('cronograma novo (DIS-07)', () => {
  it('inclui, altera e remove; o que o aluno editou fica como ele deixou', async () => {
    const ana = await user();
    const first = await withReadyImport(ana, [
      item(),
      item({ date: '2026-08-17', title: 'Choque séptico' }),
      item({ date: '2026-08-24', title: 'Sepse' }),
      item({ date: '2026-09-14', type: 'prova', title: 'P1', start: null, end: null }),
    ]);
    await svc.confirmImport(ana, first.importId, [
      item(),
      item({ date: '2026-08-17', title: 'Choque séptico' }),
      item({ date: '2026-08-24', title: 'Sepse' }),
      item({ date: '2026-09-14', type: 'prova', title: 'P1', start: null, end: null }),
    ]);
    // O aluno mudou a sala da aula de choque séptico na agenda.
    await owner
      .update(s.lessons)
      .set({ location: 'Auditório', modifiedByStudent: true })
      .where(and(eq(s.lessons.ownerId, ana), eq(s.lessons.title, 'Choque séptico')));

    const next = [
      item({ start: '09:00', end: '11:00' }), // hora mudou
      item({ date: '2026-08-17', title: 'Choque séptico', start: '14:00', end: '16:00' }),
      // "Sepse" saiu; a P1 continua; entrou uma entrega.
      item({ date: '2026-09-14', type: 'prova', title: 'P1', start: null, end: null }),
      item({ date: '2026-09-20', type: 'entrega', title: 'Relatório', start: null, end: null }),
    ];
    const second = await withReadyImport(ana, next, first.disciplineId);
    const { import: dto } = await svc.getImport(ana, second.importId);
    expect(dto.existing).toHaveLength(4);
    expect(dto.existing.find((e) => e.original.title === 'Choque séptico')?.modifiedByStudent).toBe(
      true,
    );

    const res = await svc.confirmImport(ana, second.importId, next);
    expect(res.result).toEqual({ added: 1, changed: 1, removed: 1, kept: 1 });
    const lessons = await owner
      .select()
      .from(s.lessons)
      .where(eq(s.lessons.disciplineId, first.disciplineId))
      .orderBy(s.lessons.startsAt);
    expect(lessons.map((l) => l.title)).toEqual(['Inflamação aguda', 'Choque séptico']);
    expect(lessons[0]!.startsAt.toISOString()).toBe('2026-08-10T12:00:00.000Z');
    // Mantida como o aluno deixou (hora antiga, sala dele); o original acompanha o novo.
    expect(lessons[1]).toMatchObject({ location: 'Auditório', modifiedByStudent: true });
    expect(lessons[1]!.startsAt.toISOString()).toBe('2026-08-17T11:00:00.000Z');
    expect((lessons[1]!.original as { start: string }).start).toBe('14:00');
    const assessments = await owner
      .select()
      .from(s.assessments)
      .where(eq(s.assessments.disciplineId, first.disciplineId));
    expect(assessments.map((a) => a.name).sort()).toEqual(['P1', 'Relatório']);
  });

  it('anexar outro cronograma substitui a leitura em aberto; desanexar descarta', async () => {
    const ana = await user();
    const first = await withReadyImport(ana, [item()]);
    const second = await withReadyImport(ana, [item()], first.disciplineId);
    expect((await svc.getImport(ana, first.importId)).import.status).toBe('rejected');
    const { items } = await academics.listDisciplines(ana);
    const d = items.find((x) => x.id === first.disciplineId)!;
    expect(d.scheduleImport?.id).toBe(second.importId);
    const doc = d.documents.find((x) => x.file.id === second.fileId)!;
    await academics.detachDocument(ana, first.disciplineId, doc.id);
    expect((await svc.getImport(ana, second.importId)).import.status).toBe('rejected');
  });

  it('editar a lista de docentes não solta o docente das aulas', async () => {
    const ana = await user();
    const { importId, disciplineId } = await withReadyImport(ana, [item()]);
    await svc.confirmImport(ana, importId, [item()]);
    await academics.updateDiscipline(ana, disciplineId, {
      name: 'Fisiopatologia renomeada',
      shortName: null,
      color: 1,
      teachers: ['Dra. Juliana', 'Dr. Felipe'],
    });
    const [lesson] = await owner
      .select()
      .from(s.lessons)
      .where(eq(s.lessons.disciplineId, disciplineId));
    expect(lesson!.teacherId).not.toBeNull();
  });
});
