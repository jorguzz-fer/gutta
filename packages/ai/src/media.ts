import type { Alignment } from '@gutta/core';

// Provedores de mídia da produção de aulas (docs/producao/ESPECIFICACAO.md, Fase 3; ADR 0021).
// Higgsfield para imagem e vídeo, ElevenLabs para a narração. Só no worker, com as chaves do
// servidor. Detalhes conferidos em docs.higgsfield.ai e elevenlabs.io/docs em 21/11/2026:
// - Higgsfield: POST /{endpoint} com "Authorization: Key id:secret" e Idempotency-Key; resposta
//   com request_id e status_url; GET /requests/{id}/status até completed, failed, nsfw ou canceled;
//   429 (fila cheia, com Retry-After), 403 (saldo), 423 e 503 (modelo indisponível).
//   Entradas por URL pública: POST /files/generate-upload-url e PUT no endereço devolvido.
// - ElevenLabs: POST /v1/text-to-speech/{voz}/with-timestamps com xi-api-key; devolve o áudio
//   em base64 e o tempo de cada caractere do texto original.

/** O provedor pediu para esperar (fila cheia, modelo bloqueado): tentar de novo depois. */
export class MediaRetryLater extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'MediaRetryLater';
  }
}

/** Não adianta repetir sem alguém agir (chave errada, saldo, pedido recusado). */
export class MediaBlocked extends Error {
  constructor(
    message: string,
    readonly reason: 'auth' | 'balance' | 'invalid' | 'moderation',
  ) {
    super(message);
    this.name = 'MediaBlocked';
  }
}

export type MediaStatus =
  | { status: 'pending' }
  | { status: 'completed'; url: string }
  | { status: 'failed'; error: string; moderated: boolean };

export interface MediaProvider {
  readonly name: string;
  /** Sobe uma imagem nossa (referência ou primeiro quadro) e devolve a URL pública dela. */
  uploadImage(body: Buffer, contentType: 'image/jpeg' | 'image/png'): Promise<string>;
  /** Pede uma imagem. A chave de idempotência garante que repetir não cobra de novo. */
  submitImage(
    input: { prompt: string; referenceUrls: string[]; aspectRatio: string },
    idempotencyKey: string,
  ): Promise<string>;
  /** Pede um clipe a partir de uma imagem (primeiro quadro). */
  submitClip(
    input: { prompt: string; imageUrl: string; seconds: number },
    idempotencyKey: string,
  ): Promise<string>;
  check(requestId: string): Promise<MediaStatus>;
  download(url: string): Promise<Buffer>;
}

export type Narration = { audio: Buffer; alignment: Alignment; characters: number };

export interface Narrator {
  readonly name: string;
  narrate(text: string, voiceId: string): Promise<Narration>;
}

type FetchLike = typeof fetch;

export const HIGGSFIELD_DEFAULTS = {
  base: 'https://api.higgsfield.ai',
  // O piloto usou gpt_image_2_6 pelo app; na API pública, o Marketing Studio Image aceita até 16
  // imagens de referência (mesmo paciente normal e doente). Trocável por variável.
  imageEndpoint: 'marketing-studio/image',
  videoEndpoint: 'kling-video/v3.0/pro/image-to-video',
};

export class HiggsfieldProvider implements MediaProvider {
  readonly name = 'higgsfield';
  constructor(
    private keyId: string,
    private keySecret: string,
    private opts: { base?: string; imageEndpoint?: string; videoEndpoint?: string } = {},
    private fetchImpl: FetchLike = fetch,
  ) {}

  private get base() {
    return this.opts.base ?? HIGGSFIELD_DEFAULTS.base;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Key ${this.keyId}:${this.keySecret}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/${path.replace(/^\//, '')}`, {
        ...init,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new MediaRetryLater('A Higgsfield não respondeu.', 30);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return body;
    const detail = body.detail as
      { retry_after_seconds?: number; code?: string } | string | undefined;
    const retryAfter =
      Number(res.headers.get('retry-after')) ||
      (typeof detail === 'object' ? detail?.retry_after_seconds : undefined) ||
      60;
    if (res.status === 401) throw new MediaBlocked('Chave da Higgsfield inválida.', 'auth');
    if (res.status === 403)
      throw new MediaBlocked(
        'Saldo insuficiente na Higgsfield. Adicione créditos e retome.',
        'balance',
      );
    if (res.status === 429)
      throw new MediaRetryLater('A fila da Higgsfield está cheia.', retryAfter);
    if (res.status === 423 || res.status === 503)
      throw new MediaRetryLater('O modelo da Higgsfield está indisponível agora.', 600);
    if (res.status >= 500) throw new MediaRetryLater(`Erro da Higgsfield (${res.status}).`, 60);
    throw new MediaBlocked(
      `A Higgsfield recusou o pedido (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail ?? body)}`,
      'invalid',
    );
  }

  async uploadImage(body: Buffer, contentType: 'image/jpeg' | 'image/png') {
    const up = await this.call('files/generate-upload-url', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ content_type: contentType }),
    });
    const res = await this.fetchImpl(String(up.upload_url), {
      method: 'PUT',
      headers: (up.upload_headers as Record<string, string>) ?? { 'Content-Type': contentType },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new MediaRetryLater(`O envio da imagem falhou (${res.status}).`, 30);
    return String(up.public_url);
  }

  async submitImage(
    input: { prompt: string; referenceUrls: string[]; aspectRatio: string },
    idempotencyKey: string,
  ) {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      quality: 'high',
      aspect_ratio: input.aspectRatio,
    };
    if (input.referenceUrls.length) body.image_urls = input.referenceUrls;
    const r = await this.call(this.opts.imageEndpoint ?? HIGGSFIELD_DEFAULTS.imageEndpoint, {
      method: 'POST',
      headers: this.headers({ 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify(body),
    });
    return String(r.request_id);
  }

  async submitClip(
    input: { prompt: string; imageUrl: string; seconds: number },
    idempotencyKey: string,
  ) {
    const r = await this.call(this.opts.videoEndpoint ?? HIGGSFIELD_DEFAULTS.videoEndpoint, {
      method: 'POST',
      headers: this.headers({ 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify({
        prompt: input.prompt,
        image_url: input.imageUrl,
        duration: input.seconds,
        sound: 'off',
      }),
    });
    return String(r.request_id);
  }

  async check(requestId: string): Promise<MediaStatus> {
    const r = await this.call(`requests/${encodeURIComponent(requestId)}/status`, {
      method: 'GET',
      headers: this.headers(),
    });
    const status = String(r.status);
    if (status === 'completed') {
      const images = r.images as { url: string }[] | undefined;
      const video = r.video as { url: string } | undefined;
      const url = video?.url ?? images?.[0]?.url;
      if (!url)
        return {
          status: 'failed',
          error: 'A Higgsfield não devolveu o arquivo.',
          moderated: false,
        };
      return { status: 'completed', url };
    }
    if (status === 'failed' || status === 'nsfw' || status === 'canceled')
      return {
        status: 'failed',
        error:
          status === 'nsfw'
            ? 'A moderação da Higgsfield recusou a imagem. Reescreva a descrição.'
            : String(r.error ?? `A geração terminou como ${status}.`),
        moderated: status === 'nsfw',
      };
    return { status: 'pending' };
  }

  async download(url: string) {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new MediaRetryLater(`O download da mídia falhou (${res.status}).`, 30);
    return Buffer.from(await res.arrayBuffer());
  }
}

export class ElevenLabsNarrator implements Narrator {
  readonly name = 'elevenlabs';
  constructor(
    private apiKey: string,
    private model = 'eleven_multilingual_v2',
    private fetchImpl: FetchLike = fetch,
    private base = 'https://api.elevenlabs.io',
  ) {}

  async narrate(text: string, voiceId: string): Promise<Narration> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.base}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model_id: this.model }),
          signal: AbortSignal.timeout(180_000),
        },
      );
    } catch {
      throw new MediaRetryLater('A ElevenLabs não respondeu.', 30);
    }
    if (res.status === 401) throw new MediaBlocked('Chave da ElevenLabs inválida.', 'auth');
    if (res.status === 402)
      throw new MediaBlocked('Créditos insuficientes na ElevenLabs.', 'balance');
    if (res.status === 429)
      throw new MediaRetryLater(
        'A fila da ElevenLabs está cheia.',
        Number(res.headers.get('retry-after')) || 60,
      );
    if (res.status >= 500) throw new MediaRetryLater(`Erro da ElevenLabs (${res.status}).`, 60);
    if (!res.ok)
      throw new MediaBlocked(
        `A ElevenLabs recusou o pedido (${res.status}): ${await res.text().catch(() => '')}`.slice(
          0,
          500,
        ),
        'invalid',
      );
    const body = (await res.json()) as { audio_base64: string; alignment: Alignment | null };
    if (!body.alignment) throw new MediaRetryLater('A ElevenLabs não devolveu os tempos.', 30);
    return {
      audio: Buffer.from(body.audio_base64, 'base64'),
      alignment: body.alignment,
      characters: text.length,
    };
  }
}
