import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Ferramentas de linha de comando do worker (ADR 0012): LibreOffice para converter e Poppler
// para ler o PDF. Cada chamada roda numa pasta temporária própria, com tempo limite, sem shell.

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cognuss-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Converte um documento do Office para PDF. Sem rede: o perfil do LibreOffice fica na pasta. */
export async function toPdf(input: Buffer, ext: string, timeoutMs = 120_000): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const src = path.join(dir, `entrada.${ext}`);
    await writeFile(src, input);
    await run(
      'soffice',
      [
        `-env:UserInstallation=file://${dir}/perfil`,
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--convert-to',
        'pdf',
        '--outdir',
        dir,
        src,
      ],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
    );
    return readFile(path.join(dir, 'entrada.pdf'));
  });
}

export async function pdfPageCount(pdf: Buffer, timeoutMs = 30_000): Promise<number> {
  return withTempDir(async (dir) => {
    const src = path.join(dir, 'doc.pdf');
    await writeFile(src, pdf);
    const { stdout } = await run('pdfinfo', [src], { timeout: timeoutMs });
    const m = /^Pages:\s+(\d+)/m.exec(stdout);
    if (!m) throw new Error('pdfinfo: número de páginas não encontrado');
    return Number(m[1]);
  });
}

/** Texto de cada página. O pdftotext separa as páginas com form feed. */
export async function pdfText(pdf: Buffer, pages: number, timeoutMs = 120_000): Promise<string[]> {
  return withTempDir(async (dir) => {
    const src = path.join(dir, 'doc.pdf');
    await writeFile(src, pdf);
    const { stdout } = await run('pdftotext', ['-enc', 'UTF-8', '-layout', src, '-'], {
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    const parts = stdout.split('\f');
    return Array.from({ length: pages }, (_, i) => (parts[i] ?? '').trim());
  });
}

/** Miniatura JPEG de cada página, com 320 px de largura. */
export async function pdfThumbnails(
  pdf: Buffer,
  timeoutMs = 300_000,
): Promise<Map<number, Buffer>> {
  return withTempDir(async (dir) => {
    const src = path.join(dir, 'doc.pdf');
    await writeFile(src, pdf);
    await run(
      'pdftoppm',
      [
        '-jpeg',
        '-jpegopt',
        'quality=70',
        '-scale-to-x',
        '320',
        '-scale-to-y',
        '-1',
        src,
        path.join(dir, 'p'),
      ],
      { timeout: timeoutMs },
    );
    const out = new Map<number, Buffer>();
    for (const name of await readdir(dir)) {
      const m = /^p-0*(\d+)\.jpg$/.exec(name);
      if (m) out.set(Number(m[1]), await readFile(path.join(dir, name)));
    }
    return out;
  });
}

/** Extensão que o LibreOffice precisa para reconhecer o documento de entrada. */
export const EXT_BY_MIME: Record<string, string> = {
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
};
