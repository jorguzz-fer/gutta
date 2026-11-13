import { createHash } from 'node:crypto';
import { and, eq, schema as s, withUser } from '@gutta/db';
import { keys, type ObjectStorage } from '@gutta/storage';
import { classify } from '../files/detect';
import type { Scanner } from '../files/scanner';
import { EXT_BY_MIME, pdfPageCount, pdfText, pdfThumbnails, toPdf } from '../files/tools';
import { releaseScheduleImports } from './schedule';
import type { Handler } from './types';

export type FileDeps = { storage: ObjectStorage; scanner: Scanner };

/** Erro que não adianta tentar de novo: o arquivo vai direto para "falhou", com este motivo. */
export class FileRejected extends Error {}

const MAX_PAGES = 1000;

/**
 * Processamento de um arquivo (ADR 0012): conferir integridade, antivírus, tipo pelo
 * conteúdo, converter Office para PDF, extrair texto e miniatura por página. Cada etapa
 * pode rodar de novo sem estragar nada: a página é gravada com upsert e o objeto é sobrescrito.
 */
export function filesProcess(deps: FileDeps): Handler<'files.process'> {
  return {
    run: async ({ fileId, userId }, ctx) => {
      const file = await withUser(ctx.db, userId, (tx) =>
        tx.query.files.findFirst({
          where: and(eq(s.files.id, fileId), eq(s.files.ownerId, userId)),
        }),
      );
      // Arquivo apagado, ou já processado numa execução anterior: nada a fazer.
      if (
        !file ||
        file.status === 'ready' ||
        file.status === 'quarantined' ||
        file.status === 'failed'
      ) {
        return;
      }
      // Estado final (pronto, falhou, quarentena) libera quem esperava pelo arquivo, na mesma
      // transação: a importação de cronograma, por exemplo.
      const setStatus = (patch: Partial<typeof s.files.$inferInsert>) =>
        withUser(ctx.db, userId, async (tx) => {
          await tx
            .update(s.files)
            .set(patch)
            .where(and(eq(s.files.id, fileId), eq(s.files.ownerId, userId)));
          if (
            patch.status === 'ready' ||
            patch.status === 'failed' ||
            patch.status === 'quarantined'
          )
            await releaseScheduleImports(tx, fileId, userId);
        });

      try {
        const originalKey = keys.original(userId, fileId);
        const body = await deps.storage.get(originalKey);

        // 1. Integridade: o que chegou é o que o navegador disse que enviaria.
        if (body.length !== file.sizeBytes) throw new FileRejected('O arquivo chegou incompleto.');
        const digest = createHash('sha256').update(body).digest('hex');
        if (digest !== file.sha256)
          throw new FileRejected('O arquivo chegou diferente do enviado.');

        // 2. Antivírus. Infectado: some do bucket e fica em quarentena.
        const scan = await deps.scanner.scan(body);
        if (!scan.clean) {
          await deps.storage.delete(originalKey);
          await setStatus({
            status: 'quarantined',
            error: 'O antivírus bloqueou este arquivo.',
            processedAt: new Date(),
          });
          ctx.log.warn('file.quarantined', { fileId, signature: scan.signature });
          return;
        }
        await setStatus({ status: 'processing', scannedAt: new Date() });

        // 3. Tipo pelo conteúdo.
        const kind = classify(file.mime, body);
        if (!kind) throw new FileRejected('O conteúdo não confere com o tipo do arquivo.');

        // 4. PDF para leitura: o próprio, ou convertido do Office. Planilha e imagem não têm.
        let pdf: Buffer | null = null;
        if (kind === 'pdf') pdf = body;
        if (kind === 'office') {
          const ext = EXT_BY_MIME[file.mime];
          if (!ext) throw new FileRejected('Tipo de documento não suportado.');
          try {
            pdf = await toPdf(body, ext);
          } catch (err) {
            ctx.log.warn('file.convert_failed', { fileId, error: String(err) });
            throw new FileRejected('Não foi possível converter o documento para PDF.');
          }
          await deps.storage.put(keys.pdf(userId, fileId), pdf, 'application/pdf');
        }

        // 5. Texto e miniatura por página.
        let pageCount: number | null = null;
        if (pdf) {
          try {
            pageCount = await pdfPageCount(pdf);
          } catch {
            throw new FileRejected('O PDF está danificado ou protegido por senha.');
          }
          if (pageCount > MAX_PAGES) throw new FileRejected(`O PDF passa de ${MAX_PAGES} páginas.`);
          const texts = await pdfText(pdf, pageCount);
          const thumbs = await pdfThumbnails(pdf);
          for (const [page, jpg] of thumbs) {
            await deps.storage.put(keys.thumbnail(userId, fileId, page), jpg, 'image/jpeg');
          }
          await withUser(ctx.db, userId, async (tx) => {
            for (let page = 1; page <= pageCount!; page++) {
              const values = {
                fileId,
                ownerId: userId,
                page,
                text: texts[page - 1] ?? '',
                hasThumbnail: thumbs.has(page),
              };
              await tx
                .insert(s.filePages)
                .values(values)
                .onConflictDoUpdate({
                  target: [s.filePages.fileId, s.filePages.page],
                  set: { text: values.text, hasThumbnail: values.hasThumbnail },
                });
            }
          });
        } else if (kind === 'image') {
          pageCount = 1;
        }

        await setStatus({
          status: 'ready',
          kind,
          pageCount,
          hasPdf: kind === 'office',
          error: null,
          processedAt: new Date(),
        });
        ctx.log.info('file.ready', { fileId, kind, pages: pageCount });
      } catch (err) {
        if (err instanceof FileRejected) {
          await setStatus({ status: 'failed', error: err.message, processedAt: new Date() });
          ctx.log.warn('file.rejected', { fileId, reason: err.message });
          return;
        }
        throw err;
      }
    },
    onDead: async ({ fileId, userId }, ctx) => {
      await withUser(ctx.db, userId, async (tx) => {
        await tx
          .update(s.files)
          .set({
            status: 'failed',
            error: 'Não foi possível processar o arquivo. Tente enviar de novo.',
            processedAt: new Date(),
          })
          .where(and(eq(s.files.id, fileId), eq(s.files.ownerId, userId)));
        await releaseScheduleImports(tx, fileId, userId);
      });
    },
  };
}
