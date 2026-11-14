import net from 'node:net';

export type ScanResult = { clean: true } | { clean: false; signature: string };

export interface Scanner {
  scan(buf: Buffer): Promise<ScanResult>;
}

/**
 * Antivírus pelo clamd (ADR 0012), protocolo INSTREAM: blocos com tamanho de 4 bytes e um
 * bloco vazio no fim. Resposta "stream: OK" ou "stream: <assinatura> FOUND".
 */
export class ClamdScanner implements Scanner {
  constructor(
    private host: string,
    private port: number,
    private timeoutMs = 60_000,
  ) {}

  scan(buf: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd: tempo esgotado')));
      socket.on('error', reject);
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => {
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        if (/: OK$/.test(reply)) return resolve({ clean: true });
        const found = /: (.+) FOUND$/.exec(reply);
        if (found) return resolve({ clean: false, signature: found[1]! });
        reject(new Error(`clamd: resposta inesperada: ${reply.slice(0, 200)}`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const CHUNK = 64 * 1024;
        for (let i = 0; i < buf.length; i += CHUNK) {
          const part = buf.subarray(i, i + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length);
          socket.write(len);
          socket.write(part);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

/** Sem antivírus: só desenvolvimento e testes. Em produção o worker se recusa a subir. */
export class NoScanner implements Scanner {
  async scan(): Promise<ScanResult> {
    return { clean: true };
  }
}
