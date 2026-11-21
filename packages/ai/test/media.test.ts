import { describe, expect, it } from 'vitest';
import {
  ElevenLabsNarrator,
  HiggsfieldProvider,
  MediaBlocked,
  MediaRetryLater,
} from '../src/media';

// Clientes de mídia com fetch simulado: o formato dos pedidos segue a documentação da Higgsfield
// e da ElevenLabs (21/11/2026), e cada erro vira a decisão certa para o trabalho da fila.
type Call = { url: string; init: RequestInit };
function fakeFetch(responses: (Response | (() => Response))[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return typeof r === 'function' ? r() : r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('Higgsfield', () => {
  it('pede o clipe com a chave, a idempotência e os parâmetros do piloto (8 s, sem som)', async () => {
    const f = fakeFetch([json(200, { status: 'queued', request_id: 'req-1' })]);
    const hf = new HiggsfieldProvider('id', 'segredo', {}, f.fn);
    const id = await hf.submitClip(
      { prompt: 'zoom', imageUrl: 'https://x/a.jpg', seconds: 8 },
      'k-1',
    );
    expect(id).toBe('req-1');
    expect(f.calls[0]!.url).toBe('https://api.higgsfield.ai/kling-video/v3.0/pro/image-to-video');
    const h = f.calls[0]!.init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Key id:segredo');
    expect(h['Idempotency-Key']).toBe('k-1');
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({
      prompt: 'zoom',
      image_url: 'https://x/a.jpg',
      duration: 8,
      sound: 'off',
    });
  });

  it('imagem com referências; sem referência, sem o campo', async () => {
    const f = fakeFetch([json(200, { request_id: 'a' }), json(200, { request_id: 'b' })]);
    const hf = new HiggsfieldProvider('id', 's', {}, f.fn);
    await hf.submitImage(
      { prompt: 'p', referenceUrls: ['https://x/r.jpg'], aspectRatio: '16:9' },
      'k',
    );
    await hf.submitImage({ prompt: 'p', referenceUrls: [], aspectRatio: '16:9' }, 'k2');
    expect(f.calls[0]!.url).toBe('https://api.higgsfield.ai/marketing-studio/image');
    expect(JSON.parse(String(f.calls[0]!.init.body)).image_urls).toEqual(['https://x/r.jpg']);
    expect(JSON.parse(String(f.calls[1]!.init.body))).not.toHaveProperty('image_urls');
  });

  it('consulta o estado: pendente, pronto com o arquivo, recusado pela moderação', async () => {
    const f = fakeFetch([
      json(200, { status: 'in_progress' }),
      json(200, { status: 'completed', video: { url: 'https://cdn/v.mp4' } }),
      json(200, { status: 'completed', images: [{ url: 'https://cdn/i.jpg' }] }),
      json(200, { status: 'nsfw' }),
    ]);
    const hf = new HiggsfieldProvider('id', 's', {}, f.fn);
    expect(await hf.check('r')).toEqual({ status: 'pending' });
    expect(await hf.check('r')).toEqual({ status: 'completed', url: 'https://cdn/v.mp4' });
    expect(await hf.check('r')).toEqual({ status: 'completed', url: 'https://cdn/i.jpg' });
    expect(await hf.check('r')).toMatchObject({ status: 'failed', moderated: true });
    expect(f.calls[0]!.url).toBe('https://api.higgsfield.ai/requests/r/status');
  });

  it('fila cheia espera o Retry-After; saldo e chave bloqueiam; erro do servidor tenta de novo', async () => {
    const hf = (r: Response) => new HiggsfieldProvider('id', 's', {}, fakeFetch([r]).fn);
    const full = hf(
      json(
        429,
        { detail: { code: 'account_queue_full', retry_after_seconds: 30 } },
        { 'retry-after': '45' },
      ),
    ).submitImage({ prompt: 'p', referenceUrls: [], aspectRatio: '16:9' }, 'k');
    await expect(full).rejects.toMatchObject({ name: 'MediaRetryLater', retryAfterSeconds: 45 });
    await expect(hf(json(403, { detail: 'balance' })).check('r')).rejects.toMatchObject({
      name: 'MediaBlocked',
      reason: 'balance',
    });
    await expect(
      hf(json(401, { detail: 'Invalid credentials' })).check('r'),
    ).rejects.toBeInstanceOf(MediaBlocked);
    await expect(hf(json(503, {})).check('r')).rejects.toBeInstanceOf(MediaRetryLater);
    await expect(hf(json(422, { detail: 'bad' })).check('r')).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('sobe a imagem pela URL assinada, sem mandar a chave para o armazenamento', async () => {
    const f = fakeFetch([
      json(200, {
        public_url: 'https://cdn/in.jpg',
        upload_url: 'https://storage/put',
        upload_headers: { 'Content-Type': 'image/jpeg', 'x-amz-tagging': 'retention=temporary' },
      }),
      new Response(null, { status: 200 }),
    ]);
    const url = await new HiggsfieldProvider('id', 's', {}, f.fn).uploadImage(
      Buffer.from('x'),
      'image/jpeg',
    );
    expect(url).toBe('https://cdn/in.jpg');
    expect(f.calls[1]!.url).toBe('https://storage/put');
    expect(f.calls[1]!.init.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'x-amz-tagging': 'retention=temporary',
    });
  });
});

describe('ElevenLabs', () => {
  it('narra com a voz da disciplina e devolve o áudio e o tempo de cada caractere', async () => {
    const alignment = {
      characters: ['O', 'i'],
      character_start_times_seconds: [0, 0.1],
      character_end_times_seconds: [0.1, 0.2],
    };
    const f = fakeFetch([
      json(200, { audio_base64: Buffer.from('mp3').toString('base64'), alignment }),
    ]);
    const n = await new ElevenLabsNarrator('chave', undefined, f.fn).narrate('Oi', 'voz-1');
    expect(f.calls[0]!.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voz-1/with-timestamps?output_format=mp3_44100_128',
    );
    expect((f.calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('chave');
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({
      text: 'Oi',
      model_id: 'eleven_multilingual_v2',
    });
    expect(n.audio.toString()).toBe('mp3');
    expect(n.alignment).toEqual(alignment);
  });

  it('crédito acabado bloqueia; fila cheia espera', async () => {
    const nar = (r: Response) => new ElevenLabsNarrator('k', undefined, fakeFetch([r]).fn);
    await expect(nar(json(402, {})).narrate('a', 'v')).rejects.toMatchObject({ reason: 'balance' });
    await expect(
      nar(json(429, {}, { 'retry-after': '12' })).narrate('a', 'v'),
    ).rejects.toMatchObject({
      retryAfterSeconds: 12,
    });
  });
});
