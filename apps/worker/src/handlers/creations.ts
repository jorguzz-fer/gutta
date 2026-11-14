import {
  InvalidSourcesError,
  type CreateInput,
  type CreationOutput,
  type CreationType,
  type Creator,
  type Level,
  type SourcePage,
  type SummaryStyle,
} from '@gutta/ai';
import { SRS_ALGORITHM, addLocalDays } from '@gutta/core';
import { and, asc, desc, eq, inArray, schema as s, sql, withUser, type Tx } from '@gutta/db';
import type { Handler } from './types';

// Criação com IA (SPEC v2, AJU-01 a AJU-06; ADR 0020). O payload só tem ids; as páginas são
// lidas aqui, como o dono. A saída validada vira criação com as páginas de origem; flashcards
// entram na revisão espaçada (MEM-01) e questões ficam com o gabarito só no servidor (MEM-03).

export type CreationDeps = { creator: Creator | null };

/** Teto do material enviado ao modelo; acima dele, o corte é avisado ao aluno. */
export const MAX_SOURCE_CHARS = 120_000;

export const CREATION_MESSAGES = {
  unavailable: 'A criação com IA ainda não está disponível.',
  consent: 'Para criar com IA, autorize a leitura dos seus materiais em Privacidade.',
  noText: 'Os materiais escolhidos ainda não têm texto lido. Espere o processamento terminar.',
  refused: 'A IA não pôde gerar este conteúdo a partir destes materiais.',
  invalid:
    'A IA não conseguiu indicar as páginas de origem com segurança, então nada foi salvo. Tente de novo ou escolha menos material.',
  dead: 'Não foi possível gerar agora. Tente de novo em alguns minutos.',
} as const;

type JobInput = {
  type: CreationType;
  level: Level;
  style?: SummaryStyle;
  count?: number;
  instructions?: string | null;
  materialIds: string[];
  disciplineId?: string | null;
  topicId?: string | null;
  /** Regenerar (IA-6): substitui o conteúdo desta criação. */
  creationId?: string | null;
};

export function createCreation(deps: CreationDeps): Handler<'ai.create'> {
  return {
    run: async ({ jobId, userId }, ctx) => {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
      const job = await inTx((tx) =>
        tx.query.aiJobs.findFirst({
          where: and(eq(s.aiJobs.id, jobId), eq(s.aiJobs.ownerId, userId)),
        }),
      );
      // Cancelado, já feito ou apagado: nada a fazer (o trabalho pode repetir).
      if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
      const input = job.input as JobInput;
      const finish = (patch: Partial<typeof s.aiJobs.$inferInsert>) =>
        inTx((tx) =>
          tx
            .update(s.aiJobs)
            .set({ ...patch, finishedAt: new Date() })
            .where(and(eq(s.aiJobs.id, jobId), inArray(s.aiJobs.status, ['queued', 'running']))),
        );
      await inTx((tx) =>
        tx
          .update(s.aiJobs)
          .set({ status: 'running', startedAt: new Date() })
          .where(and(eq(s.aiJobs.id, jobId), eq(s.aiJobs.status, 'queued'))),
      );
      if (!deps.creator)
        return void (await finish({ status: 'failed', error: CREATION_MESSAGES.unavailable }));

      // Autorização para a IA ler os materiais (LGPD; a mesma do cronograma).
      const [consent] = await inTx((tx) =>
        tx
          .select({ granted: s.consentRecords.granted })
          .from(s.consentRecords)
          .where(
            and(eq(s.consentRecords.userId, userId), eq(s.consentRecords.purpose, 'ai_materials')),
          )
          .orderBy(desc(s.consentRecords.recordedAt))
          .limit(1),
      );
      if (consent?.granted !== true)
        return void (await finish({ status: 'failed', error: CREATION_MESSAGES.consent }));

      const prepared = await inTx((tx) => preparePages(tx, userId, input));
      if (!prepared.pages.length)
        return void (await finish({ status: 'failed', error: CREATION_MESSAGES.noText }));

      const request: CreateInput = {
        type: input.type,
        level: input.level,
        style: input.style,
        count: input.count,
        instructions: input.instructions,
        context: prepared.context,
        marks: prepared.marks,
        pages: prepared.pages.map(({ ref, label, text }) => ({ ref, label, text })),
      };
      let result;
      try {
        result = await deps.creator.create(request);
      } catch (err) {
        if (err instanceof InvalidSourcesError) {
          const extra = err as InvalidSourcesError & { usage?: never; model?: string };
          ctx.log.warn('ai.create_invalid', { jobId, reason: err.message, model: extra.model });
          return void (await finish({ status: 'failed', error: CREATION_MESSAGES.invalid }));
        }
        throw err;
      }

      await inTx(async (tx) => {
        await tx.insert(s.aiUsage).values({
          ownerId: userId,
          feature: `criacao_${input.type}`,
          model: result.model,
          inputTokens: result.usage.input,
          outputTokens: result.usage.output,
          cacheReadTokens: result.usage.cacheRead,
          cacheWriteTokens: result.usage.cacheWrite,
          costMicros: result.costMicros,
          refused: result.refused,
        });
      });
      if (result.refused)
        return void (await finish({ status: 'failed', error: CREATION_MESSAGES.refused }));

      await inTx(async (tx) => {
        // O aluno pode ter cancelado enquanto a IA trabalhava.
        const [still] = await tx
          .select({ status: s.aiJobs.status })
          .from(s.aiJobs)
          .where(eq(s.aiJobs.id, jobId))
          .for('update');
        if (still?.status !== 'running') return;
        const creationId = await saveCreation(tx, userId, jobId, input, result, prepared);
        await tx
          .update(s.aiJobs)
          .set({ status: 'done', resultId: creationId, finishedAt: new Date() })
          .where(eq(s.aiJobs.id, jobId));
      });
    },
    onDead: async ({ jobId, userId }, ctx) => {
      await withUser(ctx.db, userId, (tx) =>
        tx
          .update(s.aiJobs)
          .set({ status: 'failed', error: CREATION_MESSAGES.dead, finishedAt: new Date() })
          .where(and(eq(s.aiJobs.id, jobId), inArray(s.aiJobs.status, ['queued', 'running']))),
      );
    },
  };
}

type Prepared = {
  pages: (SourcePage & { materialId: string; versionId: string; page: number })[];
  context: CreateInput['context'];
  marks: string[];
  truncated: boolean;
};

/**
 * Páginas da versão atual de cada material escolhido, na ordem, com etiquetas P1, P2…, até o
 * teto. Contexto de curso, semestre e disciplina, sem dado pessoal (IA-5). Selos e dúvidas da
 * aula dessas páginas viram ênfase (AJU-09).
 */
async function preparePages(tx: Tx, userId: string, input: JobInput): Promise<Prepared> {
  const versions = await tx
    .selectDistinctOn([s.materialVersions.materialId], {
      materialId: s.materialVersions.materialId,
      versionId: s.materialVersions.id,
      fileId: s.materialVersions.fileId,
      title: s.materials.title,
    })
    .from(s.materialVersions)
    .innerJoin(s.materials, eq(s.materials.id, s.materialVersions.materialId))
    .where(
      and(
        eq(s.materialVersions.ownerId, userId),
        inArray(s.materialVersions.materialId, input.materialIds),
        sql`${s.materials.deletedAt} is null`,
      ),
    )
    .orderBy(s.materialVersions.materialId, desc(s.materialVersions.version));
  const ordered = input.materialIds
    .map((id) => versions.find((v) => v.materialId === id))
    .filter((v): v is (typeof versions)[number] => Boolean(v));
  const pages: Prepared['pages'] = [];
  let size = 0;
  let truncated = false;
  for (const v of ordered) {
    const rows = await tx
      .select({ page: s.filePages.page, text: s.filePages.text })
      .from(s.filePages)
      .where(eq(s.filePages.fileId, v.fileId))
      .orderBy(asc(s.filePages.page));
    for (const r of rows) {
      const text = r.text.trim();
      if (!text) continue;
      if (size + text.length > MAX_SOURCE_CHARS) {
        truncated = true;
        break;
      }
      size += text.length;
      pages.push({
        ref: `P${pages.length + 1}`,
        label: `${v.title}, página ${r.page}`,
        text,
        materialId: v.materialId,
        versionId: v.versionId,
        page: r.page,
      });
    }
    if (truncated) break;
  }

  const profile = await tx
    .select({
      course: s.courses.name,
      courseOther: s.studentProfiles.courseOther,
      semester: s.studentProfiles.semester,
    })
    .from(s.studentProfiles)
    .innerJoin(s.courses, eq(s.courses.id, s.studentProfiles.courseId))
    .where(eq(s.studentProfiles.userId, userId));
  const disc = input.disciplineId
    ? await tx.query.enrolledDisciplines.findFirst({
        where: and(
          eq(s.enrolledDisciplines.id, input.disciplineId),
          eq(s.enrolledDisciplines.ownerId, userId),
        ),
      })
    : null;

  const versionIds = ordered.map((v) => v.versionId);
  const marks = versionIds.length
    ? await tx
        .select({
          versionId: s.contentMarks.versionId,
          page: s.contentMarks.page,
          importance: s.contentMarks.importance,
          difficulty: s.contentMarks.difficulty,
          doubt: s.contentMarks.doubt,
          resolved: s.contentMarks.doubtResolvedAt,
        })
        .from(s.contentMarks)
        .where(
          and(eq(s.contentMarks.ownerId, userId), inArray(s.contentMarks.versionId, versionIds)),
        )
    : [];
  const markText: string[] = [];
  for (const m of marks) {
    const p = pages.find((x) => x.versionId === m.versionId && x.page === m.page);
    if (!p) continue;
    const bits = [
      m.importance === 'alta'
        ? 'alta prioridade'
        : m.importance === 'importante'
          ? 'importante'
          : null,
      m.difficulty === 'dificil' ? 'difícil' : null,
      m.doubt !== null && !m.resolved
        ? `dúvida${m.doubt ? `: ${m.doubt.slice(0, 200)}` : ''}`
        : null,
    ].filter(Boolean);
    if (bits.length) markText.push(`${p.ref}: ${bits.join(', ')}`);
  }

  return {
    pages,
    truncated,
    marks: markText,
    context: {
      course: profile[0] ? (profile[0].courseOther ?? profile[0].course) : null,
      semester: profile[0]?.semester ?? null,
      discipline: disc?.name ?? null,
    },
  };
}

async function saveCreation(
  tx: Tx,
  userId: string,
  jobId: string,
  input: JobInput,
  result: { data: CreationOutput[CreationType]; usedRefs: string[]; model: string },
  prepared: Prepared,
): Promise<string> {
  const content = {
    ...(result.data as Record<string, unknown>),
    // Etiqueta → material, versão e página, para a interface mostrar a origem (IA-2).
    sources: prepared.pages
      .filter((p) => result.usedRefs.includes(p.ref))
      .map((p) => ({ ref: p.ref, label: p.label, materialId: p.materialId, page: p.page })),
    warnings: prepared.truncated
      ? [
          'O material era grande demais e só o começo foi usado. Escolha menos páginas para cobrir o resto.',
        ]
      : [],
  };
  const title = String((result.data as { title?: string }).title ?? 'Criação').slice(0, 200);
  let creationId: string;
  if (input.creationId) {
    const [row] = await tx
      .update(s.creations)
      .set({
        content,
        title,
        model: result.model,
        stale: false,
        editedAt: null,
        jobId,
        updatedAt: new Date(),
      })
      .where(and(eq(s.creations.id, input.creationId), eq(s.creations.ownerId, userId)))
      .returning({ id: s.creations.id });
    if (!row) throw new Error('criação para regenerar não encontrada');
    creationId = row.id;
    await tx.delete(s.creationSources).where(eq(s.creationSources.creationId, creationId));
    await tx.delete(s.creationQuestions).where(eq(s.creationQuestions.creationId, creationId));
  } else {
    const [row] = await tx
      .insert(s.creations)
      .values({
        ownerId: userId,
        jobId,
        type: input.type,
        level: input.level,
        style: input.style ?? null,
        title,
        content,
        disciplineId: input.disciplineId ?? null,
        topicId: input.topicId ?? null,
        model: result.model,
      })
      .returning({ id: s.creations.id });
    creationId = row!.id;
  }

  // Fontes por material e versão (IA-2).
  const byVersion = new Map<string, { materialId: string; versionId: string; pages: number[] }>();
  for (const p of prepared.pages) {
    if (!result.usedRefs.includes(p.ref)) continue;
    const cur = byVersion.get(p.versionId) ?? {
      materialId: p.materialId,
      versionId: p.versionId,
      pages: [],
    };
    cur.pages.push(p.page);
    byVersion.set(p.versionId, cur);
  }
  if (byVersion.size)
    await tx
      .insert(s.creationSources)
      .values([...byVersion.values()].map((v) => ({ ownerId: userId, creationId, ...v })));

  if (input.type === 'questoes') {
    const qs = (result.data as CreationOutput['questoes']).questions;
    if (qs.length)
      await tx.insert(s.creationQuestions).values(
        qs.map((q, i) => ({
          ownerId: userId,
          creationId,
          position: i + 1,
          kind: q.kind,
          stem: q.stem,
          options: q.kind === 'objetiva' ? q.options : [],
          correctIndex: q.kind === 'objetiva' ? q.correctIndex : null,
          expected: q.kind === 'discursiva' ? q.expected : null,
          comment: q.comment,
          difficulty: q.difficulty,
          refs: q.refs,
        })),
      );
  }

  if (input.type === 'flashcards' && !input.creationId) {
    const profile = await tx.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
    const tz = profile?.timezone ?? 'America/Sao_Paulo';
    for (const c of (result.data as CreationOutput['flashcards']).cards) {
      const [card] = await tx
        .insert(s.flashcards)
        .values({
          ownerId: userId,
          front: c.front.slice(0, 2000),
          back: c.back.slice(0, 4000),
          visibility: 'private',
          status: 'published',
          authorId: userId,
          creationId,
          enrolledDisciplineId: input.disciplineId ?? null,
        })
        .returning({ id: s.flashcards.id });
      // Entram na revisão espaçada do MVP: o primeiro vencimento é amanhã (MEM-01).
      await tx.insert(s.flashcardSchedules).values({
        studentId: userId,
        flashcardId: card!.id,
        dueAt: addLocalDays(new Date(), 1, tz),
        algorithmVersion: SRS_ALGORITHM,
      });
    }
  }
  return creationId;
}
