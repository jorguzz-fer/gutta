import 'server-only';
import { OUTPUT_SCHEMAS, type CreationType } from '@gutta/ai';
import type { ajuda as contract } from '@gutta/contracts';
import {
  aiFeatureOn,
  and,
  asc,
  desc,
  eq,
  inArray,
  schema as s,
  sql,
  withUser,
  type Tx,
} from '@gutta/db';
import { emit } from '@gutta/jobs';
import type { z } from 'zod';
import { ApiError, badRequest, conflict, notFound } from '@/lib/api';
import { db } from '@/lib/db';
import { flags } from '@/features/flags/service';
import { latestConsent, recordConsents } from '@/features/privacy/consent';

// Ajuda Cognuss (SPEC v2, 5.14; ADR 0020). O servidor web só enfileira, mostra e edita; a IA
// roda no worker. O gabarito das questões só sai depois da tentativa (IA-9). Tudo como o dono.

type JobRow = typeof s.aiJobs.$inferSelect;
type CreationRow = typeof s.creations.$inferSelect;

export async function assertAjudaEnabled() {
  const on = await flags();
  if (!on.ajuda) {
    throw new ApiError(404, 'feature_disabled', 'Este recurso ainda não está disponível.');
  }
}

export const CONSENT_TEXT =
  'Para criar com IA, a IA precisa ler os materiais escolhidos. O conteúdo vai para a Anthropic (o modelo de IA) e para a Voyage AI (a busca por assunto), ambas nos EUA; nome, e-mail e CPF não vão. Você pode desligar em Privacidade.';

const jobDto = (j: JobRow): contract.JobDto => ({
  id: j.id,
  status: j.status,
  type: (j.input as { type: CreationType }).type,
  error: j.error,
  resultId: j.resultId,
  createdAt: j.createdAt.toISOString(),
});

async function ownJob(tx: Tx, userId: string, id: string) {
  const j = await tx.query.aiJobs.findFirst({
    where: and(eq(s.aiJobs.id, id), eq(s.aiJobs.ownerId, userId)),
  });
  if (!j) throw notFound('Geração');
  return j;
}

export async function hasAiConsent(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const c = await latestConsent(tx, userId, 'ai_materials');
    return c?.granted === true;
  });
}

type JobBody = z.output<(typeof contract.createJob)['body']>;

/** Recurso desligado pelo admin (7.7): o pedido não entra na fila. */
export const CREATION_OFF = 'A criação com IA está pausada no momento. Tente de novo mais tarde.';

async function assertCreationOn(tx: Tx) {
  if (!(await aiFeatureOn(tx, 'criacao'))) throw new ApiError(503, 'unavailable', CREATION_OFF);
}

async function enqueue(
  tx: Tx,
  userId: string,
  input: Omit<JobBody, 'grantConsent'> & { creationId?: string | null },
) {
  await assertCreationOn(tx);
  const [j] = await tx
    .insert(s.aiJobs)
    .values({ ownerId: userId, feature: 'criacao', input })
    .returning();
  await emit(tx, 'ai.create', { jobId: j!.id, userId });
  return j!;
}

/** Criar com IA (AJU-01): confere materiais e autorização e enfileira. */
export async function createJob(userId: string, body: JobBody) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    // Pausada pelo admin (7.7): avisa antes de pedir autorização ou conferir materiais.
    await assertCreationOn(tx);
    if (body.grantConsent) await recordConsents(tx, userId, { ai_materials: true });
    const consent = await latestConsent(tx, userId, 'ai_materials');
    if (consent?.granted !== true) throw conflict(CONSENT_TEXT);
    const ids = [...new Set(body.materialIds)];
    const owned = await tx
      .select({ id: s.materials.id, type: s.materials.type })
      .from(s.materials)
      .where(
        and(
          eq(s.materials.ownerId, userId),
          inArray(s.materials.id, ids),
          sql`${s.materials.deletedAt} is null`,
        ),
      );
    if (owned.length !== ids.length) throw notFound('Material');
    // Análise de provas (MAT-11): só provas e atividades anteriores entram.
    if (body.type === 'analise' && owned.some((m) => m.type === 'estudo'))
      throw badRequest('Para analisar, escolha só provas e atividades anteriores.');
    if (body.disciplineId) {
      const d = await tx.query.enrolledDisciplines.findFirst({
        where: and(
          eq(s.enrolledDisciplines.id, body.disciplineId),
          eq(s.enrolledDisciplines.ownerId, userId),
        ),
      });
      if (!d) throw notFound('Disciplina');
    }
    // Sem disciplina escolhida: a do primeiro material, se houver.
    let disciplineId = body.disciplineId ?? null;
    if (!disciplineId) {
      const [link] = await tx
        .select({ d: s.materialLinks.disciplineId })
        .from(s.materialLinks)
        .where(
          and(
            eq(s.materialLinks.ownerId, userId),
            eq(s.materialLinks.materialId, ids[0]!),
            sql`${s.materialLinks.disciplineId} is not null`,
          ),
        )
        .limit(1);
      disciplineId = link?.d ?? null;
    }
    const j = await enqueue(tx, userId, {
      type: body.type,
      level: body.level,
      style: body.style,
      count: body.count,
      instructions: body.instructions ?? null,
      materialIds: ids,
      disciplineId,
    });
    return jobDto(j);
  });
}

export async function getJob(userId: string, id: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => jobDto(await ownJob(tx, userId, id)));
}

export async function cancelJob(userId: string, id: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    await ownJob(tx, userId, id);
    await tx
      .update(s.aiJobs)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(and(eq(s.aiJobs.id, id), inArray(s.aiJobs.status, ['queued', 'running'])));
    return jobDto(await ownJob(tx, userId, id));
  });
}

// -------------------------------------------------------------------------------------------
// Minhas criações (AJU-10)

async function summaries(tx: Tx, userId: string, rows: CreationRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const disc = await tx
    .select({ id: s.enrolledDisciplines.id, name: s.enrolledDisciplines.name })
    .from(s.enrolledDisciplines)
    .where(eq(s.enrolledDisciplines.ownerId, userId));
  const src = await tx
    .select({ creationId: s.creationSources.creationId, title: s.materials.title })
    .from(s.creationSources)
    .leftJoin(s.materials, eq(s.materials.id, s.creationSources.materialId))
    .where(inArray(s.creationSources.creationId, ids));
  return rows.map((c): contract.CreationSummaryDto => ({
    id: c.id,
    type: c.type,
    level: c.level,
    title: c.title,
    disciplineId: c.disciplineId,
    disciplineName: disc.find((d) => d.id === c.disciplineId)?.name ?? null,
    stale: c.stale,
    edited: Boolean(c.editedAt),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    sourceTitles: [
      ...new Set(src.filter((x) => x.creationId === c.id && x.title).map((x) => x.title!)),
    ],
  }));
}

export async function listCreations(
  userId: string,
  q: { disciplineId?: string; type?: CreationType },
) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    const rows = await tx
      .select()
      .from(s.creations)
      .where(
        and(
          eq(s.creations.ownerId, userId),
          q.disciplineId ? eq(s.creations.disciplineId, q.disciplineId) : undefined,
          q.type ? eq(s.creations.type, q.type) : undefined,
        ),
      )
      .orderBy(desc(s.creations.updatedAt));
    return { items: await summaries(tx, userId, rows) };
  });
}

async function ownCreation(tx: Tx, userId: string, id: string) {
  const c = await tx.query.creations.findFirst({
    where: and(eq(s.creations.id, id), eq(s.creations.ownerId, userId)),
  });
  if (!c) throw notFound('Criação');
  return c;
}

async function questionsOf(tx: Tx, userId: string, creationId: string) {
  const qs = await tx
    .select()
    .from(s.creationQuestions)
    .where(
      and(eq(s.creationQuestions.ownerId, userId), eq(s.creationQuestions.creationId, creationId)),
    )
    .orderBy(asc(s.creationQuestions.position));
  if (!qs.length) return [];
  const attempts = await tx
    .select()
    .from(s.creationQuestionAttempts)
    .where(
      inArray(
        s.creationQuestionAttempts.questionId,
        qs.map((q) => q.id),
      ),
    )
    .orderBy(desc(s.creationQuestionAttempts.createdAt));
  return qs.map((q) => questionDto(q, attempts.find((a) => a.questionId === q.id) ?? null));
}

/** Sem tentativa, sem gabarito nem comentário (IA-9). */
function questionDto(
  q: typeof s.creationQuestions.$inferSelect,
  a: typeof s.creationQuestionAttempts.$inferSelect | null,
): contract.QuestionDto {
  return {
    id: q.id,
    position: q.position,
    kind: q.kind,
    stem: q.stem,
    options: q.options,
    difficulty: q.difficulty,
    refs: q.refs,
    answer: a
      ? {
          chosenIndex: a.chosenIndex,
          answerText: a.answerText,
          correct: a.correct,
          correctIndex: q.correctIndex,
          expected: q.expected,
          comment: q.comment,
        }
      : null,
  };
}

async function creationDto(tx: Tx, userId: string, c: CreationRow): Promise<contract.CreationDto> {
  const [summary] = await summaries(tx, userId, [c]);
  const content = { ...(c.content as Record<string, unknown>) };
  const sources = (content.sources as contract.CreationDto['sources'] | undefined) ?? [];
  const warnings = (content.warnings as string[] | undefined) ?? [];
  delete content.sources;
  delete content.warnings;
  // Nas questões, o conteúdo bruto tem o gabarito: não vai ao navegador.
  if (c.type === 'questoes') delete content.questions;
  return {
    ...summary!,
    content,
    sources,
    warnings,
    questions: c.type === 'questoes' ? await questionsOf(tx, userId, c.id) : [],
    model: c.model,
  };
}

export async function getCreation(userId: string, id: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) =>
    creationDto(tx, userId, await ownCreation(tx, userId, id)),
  );
}

/**
 * Editar (IA-6). Renomear vale para tudo; o conteúdo editado precisa passar no esquema do
 * tipo, com as páginas de origem que já tinha. Questões não se editam (o gabarito é do servidor).
 */
export async function updateCreation(
  userId: string,
  id: string,
  body: z.output<(typeof contract.updateCreation)['body']>,
) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    const c = await ownCreation(tx, userId, id);
    let content = c.content as Record<string, unknown>;
    if (body.content) {
      if (c.type === 'questoes') throw badRequest('Questões geradas não podem ser editadas.');
      const parsed = OUTPUT_SCHEMAS[c.type].safeParse(body.content);
      if (!parsed.success) throw badRequest('O conteúdo editado está incompleto.');
      content = { ...parsed.data, sources: content.sources, warnings: content.warnings };
    }
    const [row] = await tx
      .update(s.creations)
      .set({
        title: body.title ?? c.title,
        content,
        editedAt: body.content ? new Date() : c.editedAt,
        updatedAt: new Date(),
      })
      .where(eq(s.creations.id, id))
      .returning();
    return creationDto(tx, userId, row!);
  });
}

export async function deleteCreation(userId: string, id: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    await ownCreation(tx, userId, id);
    // Os flashcards gerados saem junto (o aluno apagou a criação de que eles vieram).
    await tx
      .delete(s.flashcards)
      .where(and(eq(s.flashcards.ownerId, userId), eq(s.flashcards.creationId, id)));
    await tx.delete(s.creations).where(eq(s.creations.id, id));
    return { ok: true as const };
  });
}

/** Gera de novo com as escolhas e os materiais da geração original (IA-6, AJU-11). */
export async function regenerateCreation(userId: string, id: string) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    const c = await ownCreation(tx, userId, id);
    const consent = await latestConsent(tx, userId, 'ai_materials');
    if (consent?.granted !== true) throw conflict(CONSENT_TEXT);
    const original = c.jobId
      ? await tx.query.aiJobs.findFirst({ where: eq(s.aiJobs.id, c.jobId) })
      : null;
    const input = (original?.input ?? {}) as Omit<JobBody, 'grantConsent'>;
    const sources = await tx
      .select({ materialId: s.creationSources.materialId })
      .from(s.creationSources)
      .where(eq(s.creationSources.creationId, id));
    const materialIds = input.materialIds?.length
      ? input.materialIds
      : (sources.map((x) => x.materialId).filter(Boolean) as string[]);
    if (!materialIds.length) throw conflict('Os materiais de origem não existem mais.');
    const j = await enqueue(tx, userId, {
      type: c.type,
      level: c.level,
      style: (c.style ?? undefined) as JobBody['style'],
      count: input.count,
      instructions: input.instructions ?? null,
      materialIds,
      disciplineId: c.disciplineId,
      creationId: c.id,
    });
    return jobDto(j);
  });
}

/** Questão gerada (MEM-03): correção no servidor; o gabarito só volta depois. */
export async function answerQuestion(
  userId: string,
  id: string,
  body: z.output<(typeof contract.answerQuestion)['body']>,
  clientKey: string | null,
) {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    const q = await tx.query.creationQuestions.findFirst({
      where: and(eq(s.creationQuestions.id, id), eq(s.creationQuestions.ownerId, userId)),
    });
    if (!q) throw notFound('Questão');
    let correct: boolean | null = null;
    if (q.kind === 'objetiva') {
      if (body.chosenIndex === null || body.chosenIndex === undefined)
        throw badRequest('Escolha uma alternativa.');
      if (body.chosenIndex >= q.options.length) throw badRequest('Alternativa inexistente.');
      correct = body.chosenIndex === q.correctIndex;
    } else if (!body.answerText?.trim()) throw badRequest('Escreva sua resposta.');
    const [a] = await tx
      .insert(s.creationQuestionAttempts)
      .values({
        ownerId: userId,
        questionId: id,
        chosenIndex: q.kind === 'objetiva' ? body.chosenIndex! : null,
        answerText: q.kind === 'discursiva' ? body.answerText!.trim() : null,
        correct,
        clientKey,
      })
      .onConflictDoNothing()
      .returning();
    const attempt =
      a ??
      (await tx.query.creationQuestionAttempts.findFirst({
        where: and(
          eq(s.creationQuestionAttempts.ownerId, userId),
          eq(s.creationQuestionAttempts.clientKey, clientKey ?? ''),
        ),
      }))!;
    return questionDto(q, attempt);
  });
}

/**
 * Material novo numa disciplina (AJU-11): as criações dela feitas antes ficam marcadas como
 * desatualizadas e podem ser geradas de novo. Chamado pelo Material de Estudo.
 */
export async function markCreationsStale(tx: Tx, userId: string, disciplineIds: string[]) {
  if (!disciplineIds.length) return;
  await tx
    .update(s.creations)
    .set({ stale: true })
    .where(
      and(
        eq(s.creations.ownerId, userId),
        inArray(s.creations.disciplineId, disciplineIds),
        eq(s.creations.stale, false),
      ),
    );
}

/** Para a página de criação: os materiais do aluno que já têm texto lido. */
export async function materialsForCreation(userId: string) {
  return withUser(db(), userId, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      title: string;
      type: string;
      pages: number;
      discipline_id: string | null;
      discipline: string | null;
    }>(sql`
      select distinct on (m.id) m.id, m.title, m.type::text,
        coalesce(f.page_count, 0) as pages, d.id as discipline_id, d.name as discipline
      from materials m
      join lateral (
        select v.file_id from material_versions v where v.material_id = m.id
        order by v.version desc limit 1
      ) cv on true
      join files f on f.id = cv.file_id
      left join material_links l on l.material_id = m.id and l.discipline_id is not null
      left join enrolled_disciplines d on d.id = l.discipline_id
      where m.owner_id = ${userId} and m.deleted_at is null and f.status = 'ready'
      order by m.id, l.created_at
    `);
    return rows.rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        pages: Number(r.pages),
        disciplineId: r.discipline_id,
        disciplineName: r.discipline,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  });
}

/** Exportar (AJU-12): texto em Markdown para tudo; Anki (CSV) para flashcards. */
export async function exportCreation(userId: string, id: string, format: 'texto' | 'anki') {
  await assertAjudaEnabled();
  return withUser(db(), userId, async (tx) => {
    const c = await ownCreation(tx, userId, id);
    const dto = await creationDto(tx, userId, c);
    if (format === 'anki') {
      if (c.type !== 'flashcards') throw badRequest('Anki só vale para flashcards.');
      const cards = (dto.content.cards as { front: string; back: string }[]) ?? [];
      const esc = (t: string) => `"${t.replace(/"/g, '""')}"`;
      return {
        filename: `${slug(c.title)}.csv`,
        type: 'text/csv; charset=utf-8',
        body: cards.map((x) => `${esc(x.front)},${esc(x.back)}`).join('\n') + '\n',
      };
    }
    return {
      filename: `${slug(c.title)}.md`,
      type: 'text/markdown; charset=utf-8',
      body: toMarkdown(dto),
    };
  });
}

const slug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'criacao';

const SEAL = 'Gerado por IA a partir dos seus materiais · sem revisão editorial';

export function toMarkdown(c: contract.CreationDto): string {
  const label = new Map(c.sources.map((x) => [x.ref, x.label]));
  const cite = (refs: string[] | undefined) =>
    refs?.length ? ` (${refs.map((r) => label.get(r) ?? r).join('; ')})` : '';
  const k = c.content as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: string[] = [`# ${c.title}`, '', `_${SEAL}_`, ''];
  if (c.type === 'resumo') {
    for (const sec of k.sections ?? []) {
      out.push(`## ${sec.heading}`, '');
      for (const p of sec.points ?? []) out.push(`- ${p.text}${cite(p.refs)}`);
      out.push('');
    }
    if (k.keyConcepts?.length) {
      out.push('## Conceitos fundamentais', '');
      for (const x of k.keyConcepts) out.push(`- **${x.term}**: ${x.explanation}${cite(x.refs)}`);
      out.push('');
    }
    if (k.complement?.length) {
      out.push('## Complemento (fora dos seus materiais)', '');
      for (const x of k.complement) out.push(`- ${x.text}`);
      out.push('');
    }
  } else if (c.type === 'flashcards') {
    for (const x of k.cards ?? []) out.push(`- **${x.front}**`, `  ${x.back}${cite(x.refs)}`);
  } else if (c.type === 'questoes') {
    for (const q of c.questions) {
      out.push(`${q.position}. ${q.stem}`);
      q.options.forEach((o, i) => out.push(`   ${String.fromCharCode(97 + i)}) ${o}`));
      out.push('');
    }
  } else if (c.type === 'analise') {
    const n = Number(k.documentsAnalyzed ?? 0);
    out.push(
      `**${n} ${n === 1 ? 'documento analisado' : 'documentos analisados'}.** ${k.notice ?? ''}`,
      '',
    );
    type Item = { name: string; documents: number; detail: string; refs: string[] };
    const list = (heading: string, items: Item[] | undefined) => {
      if (!items?.length) return;
      out.push(`## ${heading}`, '');
      for (const x of items)
        out.push(`- **${x.name}** (em ${x.documents} de ${n}): ${x.detail}${cite(x.refs)}`);
      out.push('');
    };
    list('Temas mais frequentes', k.topics);
    list('Formatos de questão', k.formats);
    list('Competências exigidas', k.competencies);
    if (k.directions?.length) {
      out.push('## O que revisar', '');
      for (const d of k.directions) out.push(`- **${d.topic}**: ${d.suggestion}${cite(d.refs)}`);
    }
  } else if (c.type === 'mapa') {
    out.push(`Conceito central: **${k.central}**`, '');
    const names = new Map(
      (k.nodes ?? []).map((n: { id: string; label: string }) => [n.id, n.label]),
    );
    for (const n of k.nodes ?? [])
      out.push(`- ${n.label}${n.detail ? `: ${n.detail}` : ''}${cite(n.refs)}`);
    out.push('');
    for (const e of k.edges ?? [])
      out.push(`- ${names.get(e.from)} → ${e.relation} → ${names.get(e.to)}`);
  } else {
    for (const [i, st] of (k.steps ?? []).entries())
      out.push(`${i + 1}. **${st.title}** (${st.stage}): ${st.description}${cite(st.refs)}`);
  }
  if (k.notCovered) out.push('', `> O material não cobre: ${k.notCovered}`);
  out.push('', '## Fontes', '');
  for (const x of c.sources) out.push(`- ${x.ref}: ${x.label}`);
  return out.join('\n') + '\n';
}
