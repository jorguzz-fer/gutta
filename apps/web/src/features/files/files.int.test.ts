import { createHash, randomUUID } from 'node:crypto';
import { and, createDb, createPool, eq, schema as s } from '@gutta/db';
import { keys, MemoryStorage } from '@gutta/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { forget } from '@/lib/memo';
import { setStorageForTests } from '@/lib/storage';
import * as svc from './service';

/*
  Caminho de um arquivo (ADR 0012): pedir envio, confirmar, estado e URLs assinadas.
  Isolamento: um aluno não enxerga nem baixa o arquivo de outro.
*/
const ownerPool = createPool(
  process.env.TEST_DATABASE_OWNER_URL ??
    'postgres://gutta_owner:gutta_owner_dev@localhost:5432/gutta_test',
  2,
);
const owner = createDb(ownerPool);
const store = new MemoryStorage();
let a: string;
let b: string;

async function user() {
  const id = randomUUID();
  await owner
    .insert(s.authUsers)
    .values({ id, name: 'Teste', email: `${id}@teste.gutta`, emailVerified: true });
  await owner.insert(s.profiles).values({ userId: id, displayName: 'Teste' });
  return id;
}

const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

async function setFeatures(value: Record<string, boolean>) {
  await owner
    .insert(s.appSettings)
    .values({ key: 'features', value })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
  forget('flags:');
}

beforeAll(async () => {
  a = await user();
  b = await user();
  await setFeatures({ materiais: true });
});
beforeEach(() => setStorageForTests(store));
afterAll(async () => {
  await owner.delete(s.appSettings).where(eq(s.appSettings.key, 'features'));
  await ownerPool.end();
});

describe('arquivos: envio', () => {
  it('registra o arquivo e devolve a URL de envio', async () => {
    const body = pdf(randomUUID());
    const r = await svc.requestUpload(a, {
      name: 'Aula 1.pdf',
      mime: 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
    });
    expect(r.duplicate).toBe(false);
    expect(r.file).toMatchObject({ status: 'uploading', downloadable: false, name: 'Aula 1.pdf' });
    expect(r.upload?.method).toBe('PUT');
    expect(r.upload?.url).toContain(encodeURIComponent(keys.original(a, r.file.id)));

    // Pedir de novo antes de enviar: mesmo arquivo, nova URL.
    const again = await svc.requestUpload(a, {
      name: 'Aula 1.pdf',
      mime: 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
    });
    expect(again.file.id).toBe(r.file.id);
    expect(again.upload).not.toBeNull();
  });

  it('confirmar sem o arquivo no bucket é conflito', async () => {
    const body = pdf(randomUUID());
    const r = await svc.requestUpload(a, {
      name: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
    });
    await expect(svc.completeUpload(a, r.file.id)).rejects.toMatchObject({ status: 409 });
  });

  it('tamanho diferente do informado: falha e apaga o objeto', async () => {
    const body = pdf(randomUUID());
    const r = await svc.requestUpload(a, {
      name: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
    });
    const key = keys.original(a, r.file.id);
    await store.put(key, Buffer.concat([body, Buffer.from('a mais')]), 'application/pdf');
    const done = await svc.completeUpload(a, r.file.id);
    expect(done.file).toMatchObject({ status: 'failed' });
    expect(done.file.error).toMatch(/tamanho/);
    expect(await store.head(key)).toBeNull();
  });

  it('confirma uma vez só: entra na fila com um único evento', async () => {
    const body = pdf(randomUUID());
    const r = await svc.requestUpload(a, {
      name: 'ok.pdf',
      mime: 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
    });
    await store.put(keys.original(a, r.file.id), body, 'application/pdf');
    const first = await svc.completeUpload(a, r.file.id, 'req-1');
    const second = await svc.completeUpload(a, r.file.id, 'req-2');
    expect(first.file.status).toBe('scanning');
    expect(second.file.status).toBe('scanning');
    const events = await owner
      .select()
      .from(s.outbox)
      .where(eq(s.outbox.dedupeKey, `file-${r.file.id}-process`));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      topic: 'files.process',
      payload: { fileId: r.file.id, userId: a, requestId: 'req-1' },
    });
  });

  it('o mesmo conteúdo já processado não sobe de novo', async () => {
    const body = pdf(randomUUID());
    const input = {
      name: 'dup.pdf',
      mime: 'application/pdf' as const,
      sizeBytes: body.length,
      sha256: sha(body),
    };
    const r = await svc.requestUpload(a, input);
    await owner
      .update(s.files)
      .set({ status: 'ready', scannedAt: new Date() })
      .where(eq(s.files.id, r.file.id));
    const dup = await svc.requestUpload(a, input);
    expect(dup).toMatchObject({ duplicate: true, upload: null, file: { id: r.file.id } });
    // Outro aluno com o mesmo arquivo: arquivo novo, sem revelar que já existe.
    const other = await svc.requestUpload(b, input);
    expect(other.duplicate).toBe(false);
    expect(other.file.id).not.toBe(r.file.id);
  });
});

describe('arquivos: leitura e isolamento', () => {
  let fileId: string;
  beforeAll(async () => {
    const body = pdf(randomUUID());
    const r = await svc.requestUpload(a, {
      name: 'Prova.pdf',
      mime: 'application/pdf',
      sizeBytes: body.length,
      sha256: sha(body),
    });
    fileId = r.file.id;
  });

  it('antes do antivírus, não há URL de leitura', async () => {
    await expect(
      svc.fileUrl(a, fileId, { variant: 'original', download: false }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('depois do antivírus, URL curta do original e da miniatura', async () => {
    await owner
      .update(s.files)
      .set({ status: 'ready', scannedAt: new Date(), pageCount: 1 })
      .where(eq(s.files.id, fileId));
    await owner
      .insert(s.filePages)
      .values({ fileId, ownerId: a, page: 1, text: 'x', hasThumbnail: true });
    const orig = await svc.fileUrl(a, fileId, { variant: 'original', download: true });
    expect(orig.url).toContain('disposition=attachment');
    const thumb = await svc.fileUrl(a, fileId, { variant: 'thumbnail', page: 1, download: false });
    expect(thumb.url).toContain(encodeURIComponent(keys.thumbnail(a, fileId, 1)));
    await expect(svc.fileUrl(a, fileId, { variant: 'pdf', download: false })).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it('outro aluno não vê, não baixa e não lê o texto', async () => {
    await expect(svc.getFile(b, fileId)).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.fileUrl(b, fileId, { variant: 'original', download: false }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(svc.filePages(b, fileId)).rejects.toMatchObject({ status: 404 });
    await expect(svc.completeUpload(b, fileId)).rejects.toMatchObject({ status: 404 });
    const pages = await owner.query.filePages.findMany({
      where: and(eq(s.filePages.fileId, fileId), eq(s.filePages.ownerId, b)),
    });
    expect(pages).toHaveLength(0);
  });
});

describe('arquivos: disponibilidade', () => {
  it('sem armazenamento configurado: 503', async () => {
    setStorageForTests(null);
    await expect(
      svc.requestUpload(a, {
        name: 'x.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({ status: 503, code: 'unavailable' });
  });

  it('com os módulos desligados: feature_disabled', async () => {
    await setFeatures({});
    await expect(svc.getFile(a, randomUUID())).rejects.toMatchObject({
      status: 404,
      code: 'feature_disabled',
    });
    await setFeatures({ materiais: true });
  });
});
