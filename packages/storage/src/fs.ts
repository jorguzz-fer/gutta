import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GetUrlOptions, ObjectInfo, ObjectStorage, PutUrlOptions } from './types';

/**
 * Armazenamento em disco, só para desenvolvimento e E2E: o mesmo caminho do R2 (URL assinada,
 * envio direto do navegador), sem precisar de bucket. As URLs apontam para a rota
 * /api/dev-storage do próprio app, que confere a assinatura antes de gravar ou ler.
 * Nunca em produção (storageFromEnv recusa).
 */
export class FsStorage implements ObjectStorage {
  constructor(
    private dir: string,
    private baseUrl: string,
    private secret: string,
  ) {}

  private file(key: string) {
    if (key.includes('..') || key.startsWith('/')) throw new Error('chave inválida');
    return path.join(this.dir, key);
  }

  private sign(fields: string[]) {
    return createHmac('sha256', this.secret).update(fields.join('\n')).digest('base64url');
  }

  private url(op: 'put' | 'get', key: string, params: Record<string, string>) {
    const exp = params.exp!;
    const sig = this.sign([op, key, exp, params.ct ?? '', params.len ?? '', params.disp ?? '']);
    const q = new URLSearchParams({ ...params, op, sig });
    return `${this.baseUrl}/api/dev-storage/${key.split('/').map(encodeURIComponent).join('/')}?${q}`;
  }

  /** Confere a assinatura de uma URL gerada aqui. Devolve os parâmetros ou null. */
  verify(key: string, q: URLSearchParams) {
    const op = q.get('op');
    const exp = q.get('exp') ?? '';
    if ((op !== 'put' && op !== 'get') || Number(exp) * 1000 < Date.now()) return null;
    const expected = this.sign([
      op,
      key,
      exp,
      q.get('ct') ?? '',
      q.get('len') ?? '',
      q.get('disp') ?? '',
    ]);
    const got = q.get('sig') ?? '';
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { op, contentType: q.get('ct'), length: q.get('len'), disposition: q.get('disp') };
  }

  async putUrl(key: string, opts: PutUrlOptions) {
    const exp = String(Math.floor(Date.now() / 1000) + opts.expiresIn);
    const url = this.url('put', key, {
      exp,
      ct: opts.contentType,
      len: String(opts.contentLength),
    });
    return { url, headers: { 'content-type': opts.contentType } };
  }

  async getUrl(key: string, opts: GetUrlOptions) {
    const exp = String(Math.floor(Date.now() / 1000) + opts.expiresIn);
    const disp = `${opts.disposition ?? 'inline'}${opts.filename ? `;${opts.filename}` : ''}`;
    return this.url('get', key, { exp, ct: opts.contentType ?? '', disp });
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const st = await stat(this.file(key));
      return { size: st.size };
    } catch {
      return null;
    }
  }

  async get(key: string) {
    return readFile(this.file(key));
  }

  async put(key: string, body: Buffer, _contentType?: string) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    const base = this.file(prefix);
    let n = 0;
    const walk = async (d: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else n++;
      }
    };
    await walk(base);
    await rm(base, { recursive: true, force: true });
    return n;
  }
}
