import { describe, expect, it } from 'vitest';
import { contentDisposition, keys, MemoryStorage, S3Storage, storageFromEnv } from '../src';

describe('chaves e cabeçalhos', () => {
  it('tudo de um aluno fica sob o mesmo prefixo', () => {
    expect(keys.original('u1', 'f1')).toBe('u/u1/f/f1/original');
    expect(keys.thumbnail('u1', 'f1', 3).startsWith(keys.userPrefix('u1'))).toBe(true);
  });

  it('Content-Disposition não deixa o nome do arquivo quebrar o cabeçalho', () => {
    const h = contentDisposition('attachment', 'Aula "1"\\ação.pdf');
    expect(h).toBe(
      `attachment; filename="Aula _1__a__o.pdf"; filename*=UTF-8''Aula%20%221%22%5Ca%C3%A7%C3%A3o.pdf`,
    );
    expect(contentDisposition('inline')).toBe('inline');
  });
});

describe('memória', () => {
  it('guarda, lê, informa tamanho e apaga por prefixo', async () => {
    const m = new MemoryStorage();
    await m.put('u/a/1', Buffer.from('abc'), 'text/plain');
    await m.put('u/a/2', Buffer.from('de'), 'text/plain');
    await m.put('u/b/1', Buffer.from('x'), 'text/plain');
    expect(await m.head('u/a/1')).toEqual({ size: 3, contentType: 'text/plain' });
    expect(await m.head('nada')).toBeNull();
    expect((await m.get('u/a/2')).toString()).toBe('de');
    expect(await m.deletePrefix('u/a/')).toBe(2);
    expect(m.objects.size).toBe(1);
  });
});

describe('S3 (R2)', () => {
  const s3 = new S3Storage({
    endpoint: 'https://conta.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'cognuss-test',
    accessKeyId: 'AKIAEXEMPLO',
    secretAccessKey: 'segredo-de-teste',
  });

  it('a URL de envio assina tipo e tamanho e expira', async () => {
    const { url, headers } = await s3.putUrl('u/a/f/1/original', {
      contentType: 'application/pdf',
      contentLength: 1234,
      expiresIn: 600,
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/cognuss-test/u/a/f/1/original');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('600');
    const signed = u.searchParams.get('X-Amz-SignedHeaders')!.split(';');
    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
    expect(headers).toEqual({ 'content-type': 'application/pdf' });
  });

  it('a URL de leitura fixa o nome e o modo de abertura', async () => {
    const url = new URL(
      await s3.getUrl('u/a/f/1/original', {
        filename: 'aula.pdf',
        disposition: 'attachment',
        contentType: 'application/pdf',
        expiresIn: 300,
      }),
    );
    expect(url.searchParams.get('response-content-disposition')).toContain('attachment');
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });
});

describe('configuração', () => {
  it('sem variáveis, não há armazenamento', () => {
    expect(storageFromEnv({})).toBeNull();
  });
  it('memória só fora de produção', () => {
    expect(storageFromEnv({ STORAGE_DRIVER: 'memory' })).toBeInstanceOf(MemoryStorage);
    expect(() => storageFromEnv({ STORAGE_DRIVER: 'memory', NODE_ENV: 'production' })).toThrow();
  });
  it('com as quatro variáveis, usa S3', () => {
    const s = storageFromEnv({
      STORAGE_ENDPOINT: 'https://x',
      STORAGE_BUCKET: 'b',
      STORAGE_ACCESS_KEY_ID: 'k',
      STORAGE_SECRET_ACCESS_KEY: 's',
    });
    expect(s).toBeInstanceOf(S3Storage);
  });
});

describe('disco (desenvolvimento)', () => {
  it('assina, confere e recusa adulteração ou URL vencida', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { FsStorage } = await import('../src/fs');
    const fs = new FsStorage(
      mkdtempSync(join(tmpdir(), 'st-')),
      'http://localhost:3000',
      'segredo',
    );
    const { url } = await fs.putUrl('u/a/f/1/original', {
      contentType: 'application/pdf',
      contentLength: 3,
      expiresIn: 60,
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/api/dev-storage/u/a/f/1/original');
    expect(fs.verify('u/a/f/1/original', u.searchParams)).toMatchObject({ op: 'put', length: '3' });
    expect(fs.verify('u/b/f/1/original', u.searchParams)).toBeNull();
    u.searchParams.set('len', '999');
    expect(fs.verify('u/a/f/1/original', u.searchParams)).toBeNull();
    await fs.put('u/a/f/1/original', Buffer.from('abc'), 'application/pdf');
    expect(await fs.head('u/a/f/1/original')).toEqual({ size: 3 });
    expect(await fs.deletePrefix('u/a/')).toBe(1);
    expect(await fs.head('u/a/f/1/original')).toBeNull();
    await expect(fs.put('../fora', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      'chave inválida',
    );
  });

  it('só fora de produção e com as variáveis', () => {
    expect(() => storageFromEnv({ STORAGE_DRIVER: 'fs', NODE_ENV: 'production' })).toThrow();
    expect(() => storageFromEnv({ STORAGE_DRIVER: 'fs' })).toThrow(/STORAGE_FS_DIR/);
  });
});
