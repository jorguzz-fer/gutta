import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { withTempDir } from '../files/tools';

const run = promisify(execFile);

// Montagem dos vídeos (docs/producao/ESPECIFICACAO.md, Fase 3; ADR 0021): cada clipe vira um
// trecho do tamanho da fala da sua cena (cortado, ou com o último quadro parado se a fala for
// mais longa), os trechos são emendados, entra a narração e, por cima, a legenda do texto
// autoral e os rótulos (arquivo ASS). Sem shell, cada passo com tempo limite.

export const VIDEO_SIZE = { width: 1280, height: 720 };
const FPS = 30;

async function ffmpeg(args: string[], timeoutMs = 300_000) {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Duração de um arquivo de mídia, em segundos. */
export async function mediaSeconds(body: Buffer, ext: string): Promise<number> {
  return withTempDir(async (dir) => {
    const src = path.join(dir, `m.${ext}`);
    await writeFile(src, body);
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src],
      { timeout: 30_000 },
    );
    const s = Number(stdout.trim());
    if (!Number.isFinite(s)) throw new Error('ffprobe: duração não encontrada');
    return s;
  });
}

export type AssembleInput = {
  clips: { body: Buffer; seconds: number }[];
  audio: Buffer;
  ass: string;
};

export async function assembleVideo(input: AssembleInput): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const { width, height } = VIDEO_SIZE;
    const parts: string[] = [];
    for (const [i, c] of input.clips.entries()) {
      const src = path.join(dir, `clip-${i}.mp4`);
      const out = path.join(dir, `seg-${i}.mp4`);
      await writeFile(src, c.body);
      const d = Math.max(0.5, c.seconds);
      await ffmpeg([
        '-i',
        src,
        '-vf',
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=${d.toFixed(3)}`,
        '-t',
        d.toFixed(3),
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        out,
      ]);
      parts.push(out);
    }
    const list = path.join(dir, 'lista.txt');
    // Nomes relativos à pasta da lista (seg-0.mp4…): nada a escapar.
    await writeFile(list, parts.map((p) => `file '${path.basename(p)}'`).join('\n'));
    const joined = path.join(dir, 'juntos.mp4');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
    const audio = path.join(dir, 'narracao.mp3');
    await writeFile(audio, input.audio);
    const subs = path.join(dir, 'legendas.ass');
    await writeFile(subs, input.ass);
    const out = path.join(dir, 'video.mp4');
    await ffmpeg(
      [
        '-i',
        joined,
        '-i',
        audio,
        '-vf',
        // O caminho vai escapado para o filtro (dois-pontos e barras têm sentido no ffmpeg).
        `ass=${subs.replace(/\\/g, '/').replace(/:/g, '\\:')}`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        out,
      ],
      600_000,
    );
    return readFile(out);
  });
}

// Geradores locais, sem rede: usados pelo provedor de teste (CI e E2E).

/** Imagem JPEG de uma cor, do tamanho do vídeo. */
export async function colorImage(hex: string): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const out = path.join(dir, 'i.jpg');
    const { width, height } = VIDEO_SIZE;
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `color=c=${hex}:s=${width}x${height}`,
      '-frames:v',
      '1',
      out,
    ]);
    return readFile(out);
  });
}

/** Clipe MP4 com um leve zoom sobre a imagem, como o provedor faria. */
export async function clipFromImage(image: Buffer, seconds: number): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const src = path.join(dir, 'i.jpg');
    const out = path.join(dir, 'c.mp4');
    await writeFile(src, image);
    await ffmpeg([
      '-loop',
      '1',
      '-i',
      src,
      '-t',
      String(seconds),
      '-vf',
      `fps=${FPS},format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      out,
    ]);
    return readFile(out);
  });
}

/** Áudio MP3 em silêncio, com a duração pedida. */
export async function silence(seconds: number): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const out = path.join(dir, 's.mp3');
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=mono',
      '-t',
      seconds.toFixed(2),
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      out,
    ]);
    return readFile(out);
  });
}
