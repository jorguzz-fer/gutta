import type { MediaProvider, MediaStatus, Narration, Narrator } from '@gutta/ai';
import { estimatedAlignment } from '@gutta/core';
import { clipFromImage, colorImage, silence } from './ffmpeg';

// Provedores de mídia de teste (CI e E2E): geram os arquivos localmente com o ffmpeg, sem rede e
// sem custo, com o mesmo ciclo assíncrono dos reais (pedido, consulta, download).

const COLORS = ['#20334a', '#4a2033', '#204a33', '#4a4320', '#33204a', '#204a4a'];

export class FakeMediaProvider implements MediaProvider {
  readonly name = 'fake';
  submitted: { kind: 'image' | 'clip'; key: string; prompt: string; refs: string[] }[] = [];
  /** Quantas consultas cada pedido fica pendente antes de ficar pronto. */
  constructor(private pendingChecks = 1) {}
  private checks = new Map<string, number>();
  private clips = new Map<string, string>();

  async uploadImage(body: Buffer) {
    return `fake://upload/${body.length}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async submitImage(input: { prompt: string; referenceUrls: string[] }, key: string) {
    this.submitted.push({ kind: 'image', key, prompt: input.prompt, refs: input.referenceUrls });
    return `img-${key}`;
  }

  async submitClip(input: { prompt: string; imageUrl: string; seconds: number }, key: string) {
    this.submitted.push({ kind: 'clip', key, prompt: input.prompt, refs: [input.imageUrl] });
    this.clips.set(`clip-${key}`, input.imageUrl);
    return `clip-${key}`;
  }

  async check(requestId: string): Promise<MediaStatus> {
    const n = (this.checks.get(requestId) ?? 0) + 1;
    this.checks.set(requestId, n);
    if (n <= this.pendingChecks) return { status: 'pending' };
    return { status: 'completed', url: `fake://${requestId}` };
  }

  async download(url: string) {
    const id = url.replace('fake://', '');
    const color = COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]!;
    const image = await colorImage(color);
    return id.startsWith('clip-') ? clipFromImage(image, 8) : image;
  }
}

export class FakeNarrator implements Narrator {
  readonly name = 'fake';
  calls: { text: string; voiceId: string }[] = [];
  async narrate(text: string, voiceId: string): Promise<Narration> {
    this.calls.push({ text, voiceId });
    const alignment = estimatedAlignment(text, 16);
    const seconds = alignment.character_end_times_seconds.at(-1) ?? 1;
    return { audio: await silence(seconds + 0.3), alignment, characters: text.length };
  }
}
