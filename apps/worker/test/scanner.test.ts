import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClamdScanner } from '../src/files/scanner';

// Um clamd falso que fala o protocolo INSTREAM: junta os blocos e responde conforme o conteúdo.
let server: net.Server | undefined;

function fakeClamd(reply: (data: Buffer) => string): Promise<number> {
  return new Promise((resolve) => {
    server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const cmd = 'zINSTREAM\0';
        if (buf.length < cmd.length) return;
        let off = cmd.length;
        const chunks: Buffer[] = [];
        while (off + 4 <= buf.length) {
          const len = buf.readUInt32BE(off);
          if (len === 0) {
            sock.end(`stream: ${reply(Buffer.concat(chunks))}\0`);
            return;
          }
          if (off + 4 + len > buf.length) return;
          chunks.push(buf.subarray(off + 4, off + 4 + len));
          off += 4 + len;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve((server!.address() as net.AddressInfo).port));
  });
}

afterEach(() => server?.close());

describe('clamd', () => {
  it('arquivo limpo', async () => {
    const port = await fakeClamd(() => 'OK');
    const r = await new ClamdScanner('127.0.0.1', port).scan(Buffer.alloc(200_000, 7));
    expect(r).toEqual({ clean: true });
  });

  it('arquivo infectado, com o conteúdo inteiro chegando ao clamd', async () => {
    let seen = 0;
    const port = await fakeClamd((data) => {
      seen = data.length;
      return 'Win.Test.EICAR_HDB-1 FOUND';
    });
    const r = await new ClamdScanner('127.0.0.1', port).scan(Buffer.alloc(150_000, 1));
    expect(r).toEqual({ clean: false, signature: 'Win.Test.EICAR_HDB-1' });
    expect(seen).toBe(150_000);
  });

  it('clamd fora do ar é erro (o trabalho tenta de novo)', async () => {
    await expect(new ClamdScanner('127.0.0.1', 1).scan(Buffer.from('x'))).rejects.toThrow();
  });
});
