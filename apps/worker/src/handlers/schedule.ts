import type { ScheduleExtractor } from '@gutta/ai';
import { and, asc, desc, eq, schema as s, withUser, type Tx } from '@gutta/db';
import { emit } from '@gutta/jobs';
import { keys, type ObjectStorage } from '@gutta/storage';
import { sheetText, SHEET_EXT_BY_MIME } from '../files/tools';
import type { Handler } from './types';

export type ScheduleDeps = { storage: ObjectStorage | null; extractor: ScheduleExtractor | null };

/** Abaixo disso o texto do PDF não basta (documento digitalizado): o modelo lê o PDF. */
const MIN_TEXT = 40;

export const SCHEDULE_MESSAGES = {
  unavailable:
    'A leitura automática do cronograma ainda não está disponível. Você pode cadastrar as aulas à mão.',
  noText: 'Não encontramos texto neste arquivo. Envie o cronograma em PDF, Word ou planilha.',
  refused:
    'A leitura automática não foi possível para este arquivo. Confira o documento ou cadastre as aulas à mão.',
  dead: 'Não foi possível ler o cronograma agora. Tente de novo em alguns minutos.',
} as const;

/**
 * Arquivo terminou de processar (pronto ou falhou): as importações de cronograma que
 * esperavam por ele seguem para a leitura. Roda na mesma transação que muda o arquivo.
 */
export async function releaseScheduleImports(tx: Tx, fileId: string, userId: string) {
  const waiting = await tx
    .update(s.scheduleImports)
    .set({ status: 'extracting' })
    .where(
      and(
        eq(s.scheduleImports.fileId, fileId),
        eq(s.scheduleImports.ownerId, userId),
        eq(s.scheduleImports.status, 'waiting_file'),
      ),
    )
    .returning({ id: s.scheduleImports.id });
  for (const { id } of waiting) await emit(tx, 'ai.extract_schedule', { importId: id, userId });
}

/**
 * Leitura do cronograma pela IA (SPEC v2, DIS-05). O resultado fica em `extracted` e só vira
 * aula ou avaliação quando o aluno confirma na tela de conferência. Payload só com ids; o
 * texto sai do banco ou do bucket aqui dentro, sob withUser(dono).
 */
export function extractSchedule(deps: ScheduleDeps): Handler<'ai.extract_schedule'> {
  return {
    run: async ({ importId, userId }, ctx) => {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.db, userId, fn);
      const imp = await inTx((tx) =>
        tx.query.scheduleImports.findFirst({
          where: and(eq(s.scheduleImports.id, importId), eq(s.scheduleImports.ownerId, userId)),
        }),
      );
      // Apagada, já lida ou cancelada: nada a fazer (o trabalho pode repetir).
      if (!imp || imp.status !== 'extracting') return;

      const finish = (patch: Partial<typeof s.scheduleImports.$inferInsert>) =>
        inTx((tx) =>
          tx
            .update(s.scheduleImports)
            .set(patch)
            .where(
              and(eq(s.scheduleImports.id, importId), eq(s.scheduleImports.status, 'extracting')),
            ),
        );

      if (!deps.extractor)
        return void (await finish({ status: 'failed', error: SCHEDULE_MESSAGES.unavailable }));

      // O aluno pode ter retirado a autorização depois de enviar.
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
      if (consent?.granted !== true) return void (await finish({ status: 'needs_consent' }));

      const file = await inTx((tx) =>
        tx.query.files.findFirst({
          where: and(eq(s.files.id, imp.fileId), eq(s.files.ownerId, userId)),
        }),
      );
      if (!file) return void (await finish({ status: 'failed', error: SCHEDULE_MESSAGES.noText }));
      if (file.status === 'failed' || file.status === 'quarantined') {
        return void (await finish({
          status: 'failed',
          error: file.error ?? 'O arquivo do cronograma não pôde ser processado.',
        }));
      }
      if (file.status !== 'ready') return void (await finish({ status: 'waiting_file' }));

      // Texto: planilha pelo LibreOffice; documento pelas páginas já extraídas.
      let text = '';
      let pdf: Buffer | undefined;
      if (file.kind === 'sheet') {
        const ext = SHEET_EXT_BY_MIME[file.mime];
        if (!deps.storage || !ext) throw new Error('planilha sem armazenamento ou tipo');
        text = await sheetText(await deps.storage.get(keys.original(userId, file.id)), ext);
      } else {
        const pages = await inTx((tx) =>
          tx
            .select({ page: s.filePages.page, text: s.filePages.text })
            .from(s.filePages)
            .where(eq(s.filePages.fileId, file.id))
            .orderBy(asc(s.filePages.page)),
        );
        text = pages.map((p) => `--- página ${p.page} ---\n${p.text}`).join('\n\n');
        const letters = pages.reduce((n, p) => n + p.text.replace(/\s/g, '').length, 0);
        if (letters < MIN_TEXT && deps.storage && (file.kind === 'pdf' || file.hasPdf)) {
          pdf = await deps.storage.get(
            file.hasPdf ? keys.pdf(userId, file.id) : keys.original(userId, file.id),
          );
        }
      }
      if (!pdf && text.replace(/\s/g, '').length < MIN_TEXT) {
        return void (await finish({ status: 'failed', error: SCHEDULE_MESSAGES.noText }));
      }

      const result = await deps.extractor.extract({
        text,
        pdf,
        referenceYear: imp.referenceYear,
        fileName: file.originalName,
      });

      await inTx(async (tx) => {
        await tx.insert(s.aiUsage).values({
          ownerId: userId,
          feature: 'schedule_extract',
          model: result.model,
          inputTokens: result.usage.input,
          outputTokens: result.usage.output,
          cacheReadTokens: result.usage.cacheRead,
          cacheWriteTokens: result.usage.cacheWrite,
          costMicros: result.costMicros,
          refused: result.refused,
        });
        await tx
          .update(s.scheduleImports)
          .set(
            result.refused
              ? { status: 'failed', error: SCHEDULE_MESSAGES.refused }
              : { status: 'ready', extracted: result.data, error: null },
          )
          .where(
            and(eq(s.scheduleImports.id, importId), eq(s.scheduleImports.status, 'extracting')),
          );
      });
      ctx.log.info('schedule.extracted', {
        importId,
        events: result.data.events.length,
        model: result.model,
        costMicros: result.costMicros,
        refused: result.refused,
        scanned: Boolean(pdf),
      });
    },
    onDead: async ({ importId, userId }, ctx) => {
      await withUser(ctx.db, userId, (tx) =>
        tx
          .update(s.scheduleImports)
          .set({ status: 'failed', error: SCHEDULE_MESSAGES.dead })
          .where(
            and(eq(s.scheduleImports.id, importId), eq(s.scheduleImports.status, 'extracting')),
          ),
      );
    },
  };
}
