import type { GetUrlOptions, ObjectInfo, ObjectStorage, PutUrlOptions } from './types';

/** Implementação em memória, para testes. As "URLs" só identificam a chave. */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async putUrl(key: string, opts: PutUrlOptions) {
    return {
      url: `memory://upload/${encodeURIComponent(key)}?expires=${opts.expiresIn}`,
      headers: { 'content-type': opts.contentType },
    };
  }

  async getUrl(key: string, opts: GetUrlOptions) {
    return `memory://get/${encodeURIComponent(key)}?expires=${opts.expiresIn}&disposition=${opts.disposition ?? 'inline'}`;
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const o = this.objects.get(key);
    return o ? { size: o.body.length, contentType: o.contentType } : null;
  }

  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error(`objeto não encontrado: ${key}`);
    return o.body;
  }

  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string) {
    let n = 0;
    for (const k of [...this.objects.keys()]) {
      if (k.startsWith(prefix)) {
        this.objects.delete(k);
        n++;
      }
    }
    return n;
  }
}
