import { randomUUID } from 'node:crypto';
import { and, createDb, createPool, eq, schema as s, withUser } from '@gutta/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CurrentUser, Role } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { askTutor, getTutorState, loadTutorContext, saveTutorSettings } from './service';

/*
  Tutor IA com o provedor de teste (AI_PROVIDER=fake): grava pergunta e resposta com custo,
  respeita cota e o botão de desligar, isola conversas entre alunos e não leva ao modelo a
  explicação de questão que o aluno ainda não respondeu.
*/
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
let admin: CurrentUser;
let ana: CurrentUser;
let beto: CurrentUser;
let moduleId: string;
let topicQuestion: { id: string; stem: string; right: string; explanation: string };

async function user(roles: Role[] = []): Promise<CurrentUser> {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'T', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'T' });
  for (const role of roles) await owner.insert(s.roleAssignments).values({ userId: id, role });
  return { id, name: 'T', email: `${id}@teste.gutta`, twoFactorEnabled: true, roles };
}

beforeAll(async () => {
  admin = await user(['admin']);
  ana = await user();
  beto = await user();
  const mod = await owner.query.modules.findFirst({ where: eq(s.modules.status, 'published') });
  moduleId = mod!.id;
  const q = await owner.query.questions.findFirst({
    where: and(eq(s.questions.topicId, mod!.topicId), eq(s.questions.status, 'published')),
  });
  const right = await owner.query.questionOptions.findFirst({
    where: and(eq(s.questionOptions.questionId, q!.id), eq(s.questionOptions.isCorrect, true)),
  });
  topicQuestion = {
    id: q!.id,
    stem: q!.stem,
    right: right!.id,
    explanation: right!.explanation ?? '',
  };
  await saveTutorSettings(admin, { enabled: 'on', dailyLimit: '3' });
});
afterAll(async () => {
  await saveTutorSettings(admin, { enabled: 'on', dailyLimit: '20' });
  await ownerPool.end();
});

describe('tutor IA', () => {
  it('o gabarito só entra no contexto depois que o aluno responde', async () => {
    const before = await loadTutorContext(ana, moduleId);
    expect(before.answered.map((a) => a.stem)).not.toContain(topicQuestion.stem);
    const [sess] = await owner
      .insert(s.questionSessions)
      .values({ studentId: ana.id, algorithmVersion: 'teste', targetCount: 1 })
      .returning();
    await owner.insert(s.questionAttempts).values({
      sessionId: sess!.id,
      questionId: topicQuestion.id,
      studentId: ana.id,
      selectedOptionId: topicQuestion.right,
      clientAttemptKey: randomUUID(),
    });
    const after = await loadTutorContext(ana, moduleId);
    const hit = after.answered.find((a) => a.stem === topicQuestion.stem);
    expect(hit?.explanation).toBe(topicQuestion.explanation);
    expect(hit?.gotRight).toBe(true);
    // O colega continua sem ver.
    const other = await loadTutorContext(beto, moduleId);
    expect(other.answered.map((a) => a.stem)).not.toContain(topicQuestion.stem);
  });

  it('grava pergunta e resposta com tokens e custo, e conta a cota', async () => {
    const text = await askTutor(ana, { moduleId, message: 'O que é a obstrução da via de saída?' });
    expect(text).toMatch(/Pelo material/);
    const state = await getTutorState(ana, moduleId);
    expect(state.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(state.remaining).toBe(2);
    const rows = await owner
      .select()
      .from(s.tutorMessages)
      .where(eq(s.tutorMessages.studentId, ana.id));
    expect(rows.find((r) => r.role === 'assistant')!.outputTokens).toBeGreaterThan(0);
  });

  it('para na cota diária', async () => {
    await askTutor(ana, { moduleId, message: 'Segunda pergunta?' });
    await askTutor(ana, { moduleId, message: 'Terceira pergunta?' });
    await expect(askTutor(ana, { moduleId, message: 'Quarta pergunta?' })).rejects.toMatchObject({
      status: 429,
    });
  });

  it('o colega não lê a conversa', async () => {
    const seen = await withUser(db(), beto.id, (tx) =>
      tx.select().from(s.tutorMessages).where(eq(s.tutorMessages.studentId, ana.id)),
    );
    expect(seen).toHaveLength(0);
    expect((await getTutorState(beto, moduleId)).messages).toHaveLength(0);
  });

  it('desligado pelo admin, não responde; aluno não muda a configuração', async () => {
    await saveTutorSettings(admin, { dailyLimit: '20' });
    await expect(askTutor(beto, { moduleId, message: 'Funciona?' })).rejects.toMatchObject({
      status: 503,
    });
    await expect(saveTutorSettings(beto, { enabled: 'on', dailyLimit: '500' })).rejects.toThrow();
    await saveTutorSettings(admin, { enabled: 'on', dailyLimit: '20' });
  });

  it('módulo que não está publicado não abre o tutor', async () => {
    await expect(
      askTutor(beto, { moduleId: randomUUID(), message: 'Oi, tutor?' }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
