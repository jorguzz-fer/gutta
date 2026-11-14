import 'server-only';
import type { ajuda as contract } from '@gutta/contracts';
import { and, asc, desc, eq, gte, inArray, schema as s, sql, withUser, type Tx } from '@gutta/db';
import type { z } from 'zod';
import { ApiError, badRequest, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { track } from '@/lib/events';
import { assertAjudaEnabled } from '@/features/ajuda/service';
import { latestConsent, recordConsents } from '@/features/privacy/consent';
import {
  doubtsBlock,
  extractCitations,
  MATERIAL_TUTOR_RULES,
  materialPagesBlock,
  type TutorPage,
} from './material-prompt';
import { costMicros } from './pricing';
import { HISTORY_TURNS } from './prompt';
import { aiProvider, ProviderUnavailable } from './provider';
import { readSettings } from './service';

/*
  Tutor sobre os materiais do aluno (SPEC v2, AJU-08, AJU-09, AUL-17; ADR 0020). A fonte é o
  que o aluno escolheu: materiais, a aula (os materiais ligados a ela) ou um slide. As páginas
  vão etiquetadas e a resposta cita as que usou; o que o material não cobre é dito como tal.
  Tudo como o dono (RLS). Nome, e-mail e CPF nunca vão ao modelo.
*/

type Thread = typeof s.tutorThreads.$inferSelect;
type Citation = { ref: string; label: string; materialId: string; page: number };
type CreateBody = z.output<(typeof contract.createTutorThread)['body']>;

export const TUTOR_CONSENT_TEXT =
  'Para conversar com o tutor, a IA precisa ler os materiais escolhidos. O conteúdo vai para a Anthropic (EUA); nome, e-mail e CPF não vão. Você pode desligar em Privacidade.';

/** Teto de texto por pergunta; acima dele, entram as páginas mais ligadas à pergunta. */
export const MAX_TUTOR_CHARS = 60_000;

/** Conta perguntas ao tutor do módulo e ao dos materiais: a cota diária é uma só. */
async function usedLast24h(tx: Tx, userId: string) {
  const [a] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.tutorThreadMessages)
    .where(
      and(
        eq(s.tutorThreadMessages.ownerId, userId),
        eq(s.tutorThreadMessages.role, 'user'),
        gte(s.tutorThreadMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  const [b] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.tutorMessages)
    .where(
      and(
        eq(s.tutorMessages.studentId, userId),
        eq(s.tutorMessages.role, 'user'),
        gte(s.tutorMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return (a?.n ?? 0) + (b?.n ?? 0);
}

async function ownThread(tx: Tx, userId: string, id: string) {
  const t = await tx.query.tutorThreads.findFirst({
    where: and(eq(s.tutorThreads.id, id), eq(s.tutorThreads.ownerId, userId)),
  });
  if (!t) throw notFound('Conversa');
  return t;
}

/** Última versão de cada material do aluno, na ordem pedida. */
async function latestVersions(tx: Tx, userId: string, materialIds: string[]) {
  if (!materialIds.length) return [];
  const rows = await tx
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
        inArray(s.materialVersions.materialId, materialIds),
        sql`${s.materials.deletedAt} is null`,
      ),
    )
    .orderBy(s.materialVersions.materialId, desc(s.materialVersions.version));
  return materialIds
    .map((id) => rows.find((r) => r.materialId === id))
    .filter((r): r is (typeof rows)[number] => Boolean(r));
}

type SourcePage = TutorPage & { materialId: string; page: number };

/**
 * Páginas que vão ao modelo. No slide, a página e as vizinhas. Se o texto passa do teto, ficam
 * as páginas mais ligadas à pergunta (busca em português do banco), na ordem do material.
 */
async function sourcePages(tx: Tx, userId: string, t: Thread, question: string) {
  const versions = await latestVersions(tx, userId, t.materialIds);
  const all: (Omit<SourcePage, 'ref'> & { rank: number; focus: boolean })[] = [];
  for (const v of versions) {
    const near =
      t.scope === 'slide' && t.focusPage
        ? sql`and ${s.filePages.page} between ${t.focusPage - 1} and ${t.focusPage + 1}`
        : sql``;
    const rows = await tx
      .select({
        page: s.filePages.page,
        text: s.filePages.text,
        rank: sql<number>`ts_rank(${s.filePages.search}, websearch_to_tsquery('cognuss_pt', ${question}))`,
      })
      .from(s.filePages)
      .where(sql`${s.filePages.fileId} = ${v.fileId} ${near}`)
      .orderBy(asc(s.filePages.page));
    for (const r of rows) {
      const text = r.text.trim();
      if (!text) continue;
      all.push({
        label: `${v.title}, página ${r.page}`,
        text,
        materialId: v.materialId,
        page: r.page,
        rank: Number(r.rank) || 0,
        focus: t.scope === 'slide' && r.page === t.focusPage && v.materialId === t.focusMaterialId,
      });
    }
  }
  let chosen = all;
  if (all.reduce((n, p) => n + p.text.length, 0) > MAX_TUTOR_CHARS) {
    const byRank = [...all].sort((a, b) => Number(b.focus) - Number(a.focus) || b.rank - a.rank);
    const keep = new Set<(typeof all)[number]>();
    let size = 0;
    for (const p of byRank) {
      if (size + p.text.length > MAX_TUTOR_CHARS) continue;
      keep.add(p);
      size += p.text.length;
    }
    chosen = all.filter((p) => keep.has(p));
  }
  return chosen.map((p, i): SourcePage => ({
    ref: `P${i + 1}`,
    label: p.label,
    text: p.text,
    materialId: p.materialId,
    page: p.page,
  }));
}

/** Dúvidas abertas registradas na aula ou nos materiais da conversa (AJU-09). */
async function openDoubts(tx: Tx, userId: string, t: Thread) {
  const where =
    t.scope === 'aula' && t.lessonId
      ? t.materialIds.length
        ? sql`(${s.contentMarks.lessonId} = ${t.lessonId} or ${inArray(s.contentMarks.materialId, t.materialIds)})`
        : eq(s.contentMarks.lessonId, t.lessonId)
      : t.scope === 'slide' && t.focusMaterialId
        ? sql`${s.contentMarks.materialId} = ${t.focusMaterialId} and ${s.contentMarks.page} = ${t.focusPage}`
        : t.materialIds.length
          ? inArray(s.contentMarks.materialId, t.materialIds)
          : sql`false`;
  const rows = await tx
    .select({
      doubt: s.contentMarks.doubt,
      page: s.contentMarks.page,
      title: s.materials.title,
    })
    .from(s.contentMarks)
    .leftJoin(s.materials, eq(s.materials.id, s.contentMarks.materialId))
    .where(
      and(
        eq(s.contentMarks.ownerId, userId),
        sql`${s.contentMarks.doubt} is not null`,
        sql`${s.contentMarks.doubtResolvedAt} is null`,
        where,
      ),
    )
    .orderBy(asc(s.contentMarks.createdAt))
    .limit(15);
  return rows.map((r) => {
    const text = r.doubt?.trim();
    const where = r.title && r.page ? `${r.title}, página ${r.page}` : null;
    if (text) return where ? `${text} (${where})` : text;
    return where ? `Marquei dúvida em ${where}.` : 'Marquei uma dúvida nesta aula.';
  });
}

async function threadDto(tx: Tx, userId: string, t: Thread): Promise<contract.TutorThreadDto> {
  const settings = await readSettings(tx);
  const versions = await latestVersions(tx, userId, t.materialIds);
  const messages = await tx
    .select()
    .from(s.tutorThreadMessages)
    .where(and(eq(s.tutorThreadMessages.threadId, t.id), eq(s.tutorThreadMessages.ownerId, userId)))
    .orderBy(asc(s.tutorThreadMessages.createdAt))
    .limit(80);
  return {
    id: t.id,
    scope: t.scope,
    title: t.title,
    sourceTitles: versions.map((v) => v.title),
    doubts: await openDoubts(tx, userId, t),
    remaining: Math.max(0, settings.dailyLimit - (await usedLast24h(tx, userId))),
    dailyLimit: settings.dailyLimit,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      citations: m.citations as Citation[],
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

async function ownMaterialIds(tx: Tx, userId: string, ids: string[]) {
  const owned = await tx
    .select({ id: s.materials.id, title: s.materials.title })
    .from(s.materials)
    .where(
      and(
        eq(s.materials.ownerId, userId),
        inArray(s.materials.id, ids),
        sql`${s.materials.deletedAt} is null`,
      ),
    );
  if (owned.length !== ids.length) throw notFound('Material');
  return ids.map((id) => owned.find((o) => o.id === id)!);
}

/** Abre uma conversa. Aula e slide reaproveitam a conversa que já existe para o mesmo ponto. */
export async function createTutorThread(userId: string, body: CreateBody) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    if (body.grantConsent) await recordConsents(tx, userId, { ai_materials: true });
    if ((await latestConsent(tx, userId, 'ai_materials'))?.granted !== true)
      throw conflict(TUTOR_CONSENT_TEXT);

    let values: Omit<typeof s.tutorThreads.$inferInsert, 'ownerId'>;
    if (body.scope === 'materiais') {
      const ids = [...new Set(body.materialIds ?? [])];
      if (!ids.length) throw badRequest('Escolha pelo menos um material.');
      const mats = await ownMaterialIds(tx, userId, ids);
      const [link] = await tx
        .select({ d: s.materialLinks.disciplineId })
        .from(s.materialLinks)
        .where(
          and(
            eq(s.materialLinks.materialId, ids[0]!),
            sql`${s.materialLinks.disciplineId} is not null`,
          ),
        )
        .limit(1);
      values = {
        scope: 'materiais',
        title: mats.length > 1 ? `${mats[0]!.title} e mais ${mats.length - 1}` : mats[0]!.title,
        materialIds: ids,
        disciplineId: link?.d ?? null,
      };
    } else if (body.scope === 'aula') {
      if (!body.lessonId) throw badRequest('Escolha a aula.');
      const lesson = await tx.query.lessons.findFirst({
        where: and(eq(s.lessons.id, body.lessonId), eq(s.lessons.ownerId, userId)),
      });
      if (!lesson) throw notFound('Aula');
      const links = await tx
        .selectDistinct({ id: s.materialLinks.materialId })
        .from(s.materialLinks)
        .innerJoin(s.materials, eq(s.materials.id, s.materialLinks.materialId))
        .where(and(eq(s.materialLinks.lessonId, lesson.id), sql`${s.materials.deletedAt} is null`));
      const existing = await tx.query.tutorThreads.findFirst({
        where: and(
          eq(s.tutorThreads.ownerId, userId),
          eq(s.tutorThreads.scope, 'aula'),
          eq(s.tutorThreads.lessonId, lesson.id),
        ),
        orderBy: desc(s.tutorThreads.updatedAt),
      });
      const materialIds = links.map((l) => l.id).slice(0, 20);
      if (existing) {
        // Material novo ligado à aula entra na mesma conversa.
        const [t] = await tx
          .update(s.tutorThreads)
          .set({ materialIds, updatedAt: new Date() })
          .where(eq(s.tutorThreads.id, existing.id))
          .returning();
        return threadDto(tx, userId, t!);
      }
      values = {
        scope: 'aula',
        title: lesson.title,
        materialIds,
        lessonId: lesson.id,
        disciplineId: lesson.disciplineId,
      };
    } else {
      if (!body.materialId || !body.page) throw badRequest('Escolha o slide.');
      const [mat] = await ownMaterialIds(tx, userId, [body.materialId]);
      const existing = await tx.query.tutorThreads.findFirst({
        where: and(
          eq(s.tutorThreads.ownerId, userId),
          eq(s.tutorThreads.scope, 'slide'),
          eq(s.tutorThreads.focusMaterialId, body.materialId),
          eq(s.tutorThreads.focusPage, body.page),
          body.lessonId ? eq(s.tutorThreads.lessonId, body.lessonId) : undefined,
        ),
        orderBy: desc(s.tutorThreads.updatedAt),
      });
      if (existing) return threadDto(tx, userId, existing);
      let disciplineId: string | null = null;
      if (body.lessonId) {
        const lesson = await tx.query.lessons.findFirst({
          where: and(eq(s.lessons.id, body.lessonId), eq(s.lessons.ownerId, userId)),
        });
        if (!lesson) throw notFound('Aula');
        disciplineId = lesson.disciplineId;
      }
      values = {
        scope: 'slide',
        title: `${mat!.title}, página ${body.page}`,
        materialIds: [body.materialId],
        lessonId: body.lessonId ?? null,
        focusMaterialId: body.materialId,
        focusPage: body.page,
        disciplineId,
      };
    }
    const [t] = await tx
      .insert(s.tutorThreads)
      .values({ ...values, ownerId: userId })
      .returning();
    await track(tx, userId, 'tutor_thread_opened', { scope: t!.scope });
    return threadDto(tx, userId, t!);
  });
}

export async function getTutorThread(userId: string, id: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) =>
    threadDto(tx, userId, await ownThread(tx, userId, id)),
  );
}

export async function listTutorThreads(userId: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    const rows = await tx
      .select()
      .from(s.tutorThreads)
      .where(eq(s.tutorThreads.ownerId, userId))
      .orderBy(desc(s.tutorThreads.updatedAt))
      .limit(30);
    return {
      items: rows.map((t) => ({
        id: t.id,
        scope: t.scope,
        title: t.title,
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  });
}

/** Contexto que vai ao modelo (exposto para os testes de isolamento e de citação). */
export async function loadThreadContext(userId: string, id: string, question: string) {
  return withUser(db(), userId, async (tx) => {
    const t = await ownThread(tx, userId, id);
    return {
      pages: await sourcePages(tx, userId, t, question),
      doubts: await openDoubts(tx, userId, t),
    };
  });
}

export async function askTutorThread(userId: string, id: string, message: string) {
  await assertAjudaEnabled();
  const provider = aiProvider();

  // 1) Pré-condições, páginas e a pergunta gravada, numa transação curta.
  const prep = await withUser(db(), userId, async (tx) => {
    const settings = await readSettings(tx);
    if (!settings.enabled || !provider.available())
      throw new ApiError(503, 'unavailable', 'O tutor está desligado no momento.');
    if ((await latestConsent(tx, userId, 'ai_materials'))?.granted !== true)
      throw conflict(TUTOR_CONSENT_TEXT);
    if ((await usedLast24h(tx, userId)) >= settings.dailyLimit)
      throw new ApiError(
        429,
        'rate_limited',
        `Você usou as ${settings.dailyLimit} perguntas das últimas 24 horas. O tutor volta a responder amanhã.`,
      );
    const t = await ownThread(tx, userId, id);
    const pages = await sourcePages(tx, userId, t, message);
    const doubts = await openDoubts(tx, userId, t);
    const history = await tx
      .select({ role: s.tutorThreadMessages.role, content: s.tutorThreadMessages.content })
      .from(s.tutorThreadMessages)
      .where(
        and(eq(s.tutorThreadMessages.threadId, t.id), eq(s.tutorThreadMessages.ownerId, userId)),
      )
      .orderBy(desc(s.tutorThreadMessages.createdAt))
      .limit(HISTORY_TURNS * 2);
    await tx.insert(s.tutorThreadMessages).values({
      ownerId: userId,
      threadId: t.id,
      role: 'user',
      content: message,
    });
    await tx
      .update(s.tutorThreads)
      .set({ updatedAt: new Date() })
      .where(eq(s.tutorThreads.id, t.id));
    await track(tx, userId, 'tutor_asked', { scope: t.scope });
    return { thread: t, pages, doubts, history: history.reverse() };
  });

  // 2) Modelo fora da transação. O histórico começa pelo aluno e alterna papéis.
  const turns = [
    ...prep.history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ];
  while (turns.length && turns[0]!.role !== 'user') turns.shift();
  let reply;
  try {
    reply = await provider.reply({
      rules: MATERIAL_TUTOR_RULES,
      material: materialPagesBlock(prep.pages, prep.thread.scope),
      answered: doubtsBlock(prep.doubts),
      messages: turns,
    });
  } catch (err) {
    if (err instanceof ProviderUnavailable) throw new ApiError(503, 'unavailable', err.message);
    throw err;
  }
  const valid = new Map(
    prep.pages.map((p) => [p.ref, { label: p.label, materialId: p.materialId, page: p.page }]),
  );
  const { text, citations } = extractCitations(reply.text, valid);

  // 3) Resposta com as páginas citadas; uso e custo no registro de IA.
  return withUser(db(), userId, async (tx) => {
    await tx.insert(s.tutorThreadMessages).values({
      ownerId: userId,
      threadId: prep.thread.id,
      role: 'assistant',
      content: text,
      citations,
      model: reply.model,
      refused: reply.refused,
    });
    await tx.insert(s.aiUsage).values({
      ownerId: userId,
      feature: 'tutor_materiais',
      model: reply.model,
      inputTokens: reply.usage.input,
      outputTokens: reply.usage.output,
      cacheReadTokens: reply.usage.cacheRead,
      cacheWriteTokens: reply.usage.cacheWrite,
      costMicros: costMicros(reply.model, reply.usage),
      refused: reply.refused,
    });
    return threadDto(tx, userId, await ownThread(tx, userId, prep.thread.id));
  });
}

/** Nome do ponto de partida vindo da aula (para a tela de abrir conversa). */
export async function tutorPresetLabel(
  userId: string,
  p: { scope: 'aula' | 'slide'; lessonId?: string; materialId?: string; page?: number },
) {
  return withUser(db(), userId, async (tx) => {
    if (p.scope === 'aula' && p.lessonId) {
      const l = await tx.query.lessons.findFirst({
        where: and(eq(s.lessons.id, p.lessonId), eq(s.lessons.ownerId, userId)),
      });
      return l ? `a aula ${l.title}` : null;
    }
    if (p.scope === 'slide' && p.materialId && p.page) {
      const m = await tx.query.materials.findFirst({
        where: and(eq(s.materials.id, p.materialId), eq(s.materials.ownerId, userId)),
      });
      return m ? `${m.title}, página ${p.page}` : null;
    }
    return null;
  });
}
