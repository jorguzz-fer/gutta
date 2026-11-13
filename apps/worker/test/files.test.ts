import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, schema as s, sql } from '@gutta/db';
import { keys, MemoryStorage } from '@gutta/storage';
import { connect, makeUser } from '../../../packages/db/test/helpers';
import { logger } from '../src/logger';
import { NoScanner, type Scanner } from '../src/files/scanner';
import { filesProcess } from '../src/handlers/files';
import { eraseUserObjects } from '../src/handlers/maintenance';
import type { JobContext } from '../src/handlers/types';

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name));
const PDF = fixture('aula.pdf');
const DOCX = fixture('aula.docx');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const { app, owner, appPool, ownerPool } = connect();
const store = new MemoryStorage();
let userId: string;

const ctx = (): JobContext => ({ db: app, log: logger, jobId: 'teste', attempt: 1 });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Cada envio com um aluno novo: o mesmo conteúdo não se repete para o mesmo aluno.
async function upload(body: Buffer, mime: string, opts: { sha?: string } = {}) {
  const userId = await makeUser(owner);
  const [f] = await owner
    .insert(s.files)
    .values({
      ownerId: userId,
      originalName: 'aula',
      mime,
      sizeBytes: body.length,
      sha256: opts.sha ?? sha(body),
      status: 'scanning',
    })
    .returning();
  await store.put(keys.original(userId, f!.id), body, mime);
  return { id: f!.id, userId };
}

const fileRow = async (id: string) =>
  (await owner.query.files.findFirst({ where: eq(s.files.id, id) }))!;

beforeAll(async () => {
  userId = await makeUser(owner);
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
});
afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('processamento de arquivo', () => {
  const run = filesProcess({ storage: store, scanner: new NoScanner() });

  it('PDF: texto e miniatura de cada página, pronto', async () => {
    const { id, userId } = await upload(PDF, 'application/pdf');
    await run.run({ fileId: id, userId }, ctx());
    const f = await fileRow(id);
    expect(f).toMatchObject({
      status: 'ready',
      kind: 'pdf',
      pageCount: 2,
      hasPdf: false,
      error: null,
    });
    expect(f.scannedAt).not.toBeNull();
    const pages = await owner.query.filePages.findMany({
      where: eq(s.filePages.fileId, id),
      orderBy: s.filePages.page,
    });
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0]!.text).toContain('Inflamação aguda');
    expect(pages[1]!.text).toContain('Mediadores químicos');
    expect(pages.every((p) => p.hasThumbnail)).toBe(true);
    const thumb = await store.get(keys.thumbnail(userId, id, 2));
    expect(thumb.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    // Rodar de novo (trabalho repetido) não muda nada.
    await run.run({ fileId: id, userId }, ctx());
    expect(
      await owner.query.filePages.findMany({ where: eq(s.filePages.fileId, id) }),
    ).toHaveLength(2);
  });

  it('DOCX: converte para PDF e extrai as páginas', { timeout: 120_000 }, async () => {
    const { id, userId } = await upload(DOCX, DOCX_MIME);
    await run.run({ fileId: id, userId }, ctx());
    const f = await fileRow(id);
    expect(f).toMatchObject({ status: 'ready', kind: 'office', hasPdf: true, pageCount: 2 });
    const pdf = await store.get(keys.pdf(userId, id));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('conteúdo diferente do tipo declarado: falha com motivo', async () => {
    const { id, userId } = await upload(DOCX, 'application/pdf');
    await run.run({ fileId: id, userId }, ctx());
    expect(await fileRow(id)).toMatchObject({
      status: 'failed',
      error: 'O conteúdo não confere com o tipo do arquivo.',
    });
  });

  it('resumo diferente do enviado: falha antes do antivírus', async () => {
    const { id, userId } = await upload(PDF, 'application/pdf', { sha: 'f'.repeat(64) });
    await run.run({ fileId: id, userId }, ctx());
    const f = await fileRow(id);
    expect(f).toMatchObject({ status: 'failed', error: 'O arquivo chegou diferente do enviado.' });
    expect(f.scannedAt).toBeNull();
  });

  it('infectado: quarentena e objeto apagado', async () => {
    const infected: Scanner = { scan: async () => ({ clean: false, signature: 'Teste.EICAR' }) };
    const { id, userId } = await upload(PDF, 'application/pdf');
    await filesProcess({ storage: store, scanner: infected }).run({ fileId: id, userId }, ctx());
    expect(await fileRow(id)).toMatchObject({ status: 'quarantined' });
    expect(await store.head(keys.original(userId, id))).toBeNull();
  });

  it('antivírus fora do ar: erro para tentar de novo, sem mudar o estado', async () => {
    const down: Scanner = { scan: async () => Promise.reject(new Error('clamd fora')) };
    const { id, userId } = await upload(PDF, 'application/pdf');
    await expect(
      filesProcess({ storage: store, scanner: down }).run({ fileId: id, userId }, ctx()),
    ).rejects.toThrow('clamd fora');
    expect(await fileRow(id)).toMatchObject({ status: 'scanning' });
  });

  it('quando as tentativas acabam, fica como falhou', async () => {
    const { id, userId } = await upload(PDF, 'application/pdf');
    await run.onDead!({ fileId: id, userId }, ctx(), 'qualquer');
    expect(await fileRow(id)).toMatchObject({ status: 'failed' });
  });

  it('arquivo de outro aluno não é processado em nome de quem pediu', async () => {
    const other = await makeUser(owner);
    const { id } = await upload(PDF, 'application/pdf');
    await run.run({ fileId: id, userId: other }, ctx());
    expect(await fileRow(id)).toMatchObject({ status: 'scanning' });
  });
});

describe('exclusão da conta', () => {
  it('apagar o usuário pede a limpeza do bucket, e o worker apaga o prefixo', async () => {
    const gone = await makeUser(owner);
    await store.put(keys.original(gone, randomUUID()), Buffer.from('x'), 'application/pdf');
    await store.put(keys.original(userId, randomUUID()), Buffer.from('y'), 'application/pdf');
    await owner.delete(s.authUsers).where(eq(s.authUsers.id, gone));
    const ev = await owner
      .select()
      .from(s.outbox)
      .where(eq(s.outbox.dedupeKey, `erase-objects-${gone}`));
    expect(ev[0]).toMatchObject({
      topic: 'maintenance.erase_user_objects',
      payload: { userId: gone },
    });
    await eraseUserObjects(store).run({ userId: gone }, ctx());
    const left = [...store.objects.keys()];
    expect(left.some((k) => k.startsWith(keys.userPrefix(gone)))).toBe(false);
    expect(left.some((k) => k.startsWith(keys.userPrefix(userId)))).toBe(true);
    await owner.execute(sql`delete from outbox where dedupe_key = ${`erase-objects-${gone}`}`);
  });
});
