// Mídia das peças de vídeo (docs/producao/ESPECIFICACAO.md, Fase 3; ADR 0021). Regras puras:
// o roteiro (cenas com narração autoral, imagem, movimento e rótulos), o tempo de cada cena a
// partir do alinhamento da narração, as legendas tiradas do texto autoral (nunca da transcrição)
// e o arquivo de legendas ASS que o ffmpeg queima no vídeo.

export type StoryboardScene = {
  /** Identificador curto em minúsculas ("zoom-abdome"). */
  id: string;
  /** O que a narração diz nesta cena, em português, como o professor falaria. */
  narration: string;
  /** Imagem a gerar: realista, sem nenhum texto dentro dela. */
  imagePrompt: string;
  /** Como a imagem se move no clipe (câmera, zoom, o que anima). */
  motionPrompt: string;
  /** Rótulos que entram na montagem (a IA de imagem escreve mal). */
  labels: string[];
  /** Cena cuja imagem serve de referência (mesmo paciente, mesma célula), ou null. */
  referenceScene: string | null;
};

export type Storyboard = { title: string; scenes: StoryboardScene[] };

/** Duração de cada clipe gerado (Kling 3.0, 8 s, sem som, como no piloto). */
export const CLIP_SECONDS = 8;
/** Limite de cenas por vídeo: o vídeo-resumo do piloto usou 6 clipes. */
export const MAX_SCENES = 8;

/**
 * Créditos da Higgsfield por pedido, para a cota do dia e o custo do lote. O clipe de 8 s
 * custou 14 no piloto; a imagem, "baixo por imagem" (a estimativa da API substitui quando houver).
 */
export const MEDIA_CREDITS = { image: 2, clip: 14 } as const;

/** Etapas da mídia de um vídeo, na ordem. "paused" espera o admin (saldo, chave, falha). */
export const MEDIA_STAGES = [
  'storyboard',
  'storyboard_review',
  'images',
  'images_review',
  'clips',
  'narration',
  'assembling',
  'done',
  'paused',
] as const;
export type MediaStage = (typeof MEDIA_STAGES)[number];

/** Etapas em que o trabalho de mídia age sozinho (as outras esperam o admin). */
export const MEDIA_AUTO_STAGES: readonly MediaStage[] = [
  'images',
  'clips',
  'narration',
  'assembling',
];

export const MEDIA_STAGE_LABEL: Record<MediaStage, string> = {
  storyboard: 'Escrevendo o roteiro',
  storyboard_review: 'Roteiro para aprovar',
  images: 'Gerando as imagens',
  images_review: 'Imagens para aprovar',
  clips: 'Animando os clipes',
  narration: 'Gravando a narração',
  assembling: 'Montando o vídeo',
  done: 'Vídeo pronto',
  paused: 'Pausado',
};

export const isMediaStage = (x: unknown): x is MediaStage =>
  typeof x === 'string' && (MEDIA_STAGES as readonly string[]).includes(x);

export function validateStoryboard(sb: Storyboard): string[] {
  const problems: string[] = [];
  if (!sb.scenes.length) problems.push('O roteiro não tem cenas.');
  if (sb.scenes.length > MAX_SCENES) problems.push(`O roteiro passa de ${MAX_SCENES} cenas.`);
  const ids = new Set<string>();
  for (const s of sb.scenes) {
    if (!/^[a-z0-9-]{1,40}$/.test(s.id))
      problems.push(`Identificador de cena inválido: "${s.id}".`);
    if (ids.has(s.id)) problems.push(`Cena repetida: "${s.id}".`);
    ids.add(s.id);
    if (!s.narration.trim()) problems.push(`A cena "${s.id}" não tem narração.`);
    if (!s.imagePrompt.trim()) problems.push(`A cena "${s.id}" não tem descrição da imagem.`);
    if (s.referenceScene && !ids.has(s.referenceScene))
      problems.push(`A cena "${s.id}" usa como referência uma cena que não vem antes dela.`);
    for (const l of s.labels)
      if (l.length > 40) problems.push(`Rótulo longo demais na cena "${s.id}": "${l}".`);
  }
  return problems;
}

/** Narração completa: as falas das cenas, na ordem, separadas por espaço. */
export function fullNarration(sb: Storyboard): string {
  return sb.scenes.map((s) => s.narration.trim()).join(' ');
}

/** Tempo de cada caractere da narração, como a ElevenLabs devolve (alinhamento do texto original). */
export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type SceneTiming = { id: string; start: number; end: number };

/**
 * Início e fim de cada cena na narração. A cena vai do primeiro caractere da sua fala até o
 * começo da fala seguinte (as pausas ficam com a cena que termina); a última vai até o fim do áudio.
 */
export function sceneTimings(sb: Storyboard, al: Alignment, audioSeconds: number): SceneTiming[] {
  const starts: number[] = [];
  let pos = 0;
  for (const s of sb.scenes) {
    const at = Math.min(pos, al.character_start_times_seconds.length - 1);
    starts.push(al.character_start_times_seconds[at] ?? 0);
    pos += s.narration.trim().length + 1;
  }
  starts[0] = 0;
  return sb.scenes.map((s, i) => ({
    id: s.id,
    start: round(starts[i]!),
    end: round(i + 1 < starts.length ? starts[i + 1]! : Math.max(audioSeconds, starts[i]! + 0.5)),
  }));
}

export type Caption = { start: number; end: number; text: string };

/**
 * Legendas a partir do texto autoral: frases curtas (até `maxChars`), cada uma com o tempo do
 * seu primeiro e do seu último caractere no alinhamento. O texto nunca vem da transcrição, então
 * termos como "emaciação" e "alvéolo" saem como o professor escreveu.
 */
export function captionsFromAlignment(al: Alignment, maxChars = 42): Caption[] {
  const text = al.characters.join('');
  const caps: Caption[] = [];
  const words = [...text.matchAll(/\S+/g)].map((m) => ({ w: m[0], i: m.index! }));
  let line: typeof words = [];
  const flush = () => {
    if (!line.length) return;
    const first = line[0]!;
    const last = line.at(-1)!;
    const endIdx = last.i + last.w.length - 1;
    caps.push({
      start: round(al.character_start_times_seconds[first.i] ?? 0),
      end: round(
        al.character_end_times_seconds[endIdx] ?? al.character_end_times_seconds.at(-1) ?? 0,
      ),
      text: line.map((x) => x.w).join(' '),
    });
    line = [];
  };
  for (const w of words) {
    const len = line.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
    if (line.length && len > maxChars) flush();
    line.push(w);
    // Pontuação forte fecha a legenda: uma ideia por vez na tela.
    if (/[.!?;:]$/.test(w.w)) flush();
  }
  flush();
  return caps;
}

/** Alinhamento estimado (sem provedor): tempo proporcional ao número de caracteres. */
export function estimatedAlignment(text: string, charsPerSecond = 14): Alignment {
  const characters = [...text];
  const step = 1 / charsPerSecond;
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => round(i * step)),
    character_end_times_seconds: characters.map((_, i) => round((i + 1) * step)),
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

const assTime = (s: number) => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

const assText = (t: string) => t.replace(/[{}\\]/g, '').replace(/\n/g, '\\N');

/**
 * Arquivo de legendas ASS para o ffmpeg: legenda embaixo e os rótulos de cada cena no alto, em
 * caixas com fundo, para ler sobre qualquer imagem. Fonte do sistema da imagem do worker.
 */
export function buildAss(opts: {
  width: number;
  height: number;
  captions: Caption[];
  labels: { start: number; end: number; text: string }[];
  font?: string;
}): string {
  const font = opts.font ?? 'DejaVu Sans';
  const fs = Math.round(opts.height / 20);
  const ls = Math.round(opts.height / 24);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${opts.width}
PlayResY: ${opts.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,${font},${fs},&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,1,0,0,0,100,100,0,0,3,${Math.round(fs / 5)},0,2,60,60,${Math.round(opts.height / 18)},1
Style: Rotulo,${font},${ls},&H00FFFFFF,&H00FFFFFF,&H001D18C2,&H001D18C2,1,0,0,0,100,100,0,0,3,${Math.round(ls / 4)},0,7,50,50,${Math.round(opts.height / 18)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = [
    ...opts.labels.map(
      (l) => `Dialogue: 1,${assTime(l.start)},${assTime(l.end)},Rotulo,,0,0,0,,${assText(l.text)}`,
    ),
    ...opts.captions.map(
      (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Legenda,,0,0,0,,${assText(c.text)}`,
    ),
  ];
  return header + lines.join('\n') + '\n';
}

/** Rótulos de cada cena, um embaixo do outro, durante a cena toda. */
export function sceneLabels(sb: Storyboard, timings: SceneTiming[]) {
  const byId = new Map(timings.map((t) => [t.id, t]));
  return sb.scenes.flatMap((s) => {
    const t = byId.get(s.id);
    if (!t || !s.labels.length) return [];
    return [{ start: t.start, end: t.end, text: s.labels.join('\n') }];
  });
}

/** Marcador do endereço do vídeo na peça; o servidor troca pelo endereço servido pelo app. */
export const VIDEO_SRC_PLACEHOLDER = '__COGNUSS_VIDEO_SRC__';

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Peça do tipo vídeo: a mesma estrutura das outras (abertura, área, fechamento), com o vídeo
 * montado no lugar da cena. Não passa pela IA: o conteúdo vem do plano aprovado e do roteiro.
 */
export function videoPieceBlocks(input: {
  title: string;
  theme: string;
  lead: string;
  fixar: string;
  naProva: string;
  storyboard: Storyboard;
}) {
  const chapters = input.storyboard.scenes.map((s) => `<li>${escHtml(s.narration)}</li>`).join('');
  return {
    title: input.title,
    style: `.vid{display:block;width:100%;height:auto;background:#000;border-radius:var(--radius-lg)}
.chap{margin:0;padding-left:20px;line-height:1.6;color:var(--muted)}`,
    body: `  <section>
    <div class="eyebrow">Peça interativa · ${escHtml(input.theme)}</div>
    <h1>${escHtml(input.title)}</h1>
    <p class="lead">${escHtml(input.lead)}</p>
  </section>
  <div class="card stage">
    <video class="vid" controls playsinline preload="metadata" aria-label="Vídeo com narração: ${escHtml(input.title)}" src="${VIDEO_SRC_PLACEHOLDER}"></video>
  </div>
  <div class="card panel">
    <div class="lbl">Roteiro da narração</div>
    <ol class="chap">${chapters}</ol>
  </div>
  <div class="card explain">
    <div><div class="eyebrow">Para fixar</div><h2>${escHtml(input.title)}</h2><p>${escHtml(input.fixar)}</p></div>
    <div class="exam"><div class="lbl" style="color:var(--accent)">Na prova</div><p>${escHtml(input.naProva)}</p></div>
  </div>`,
    script: `const v=document.querySelector('.vid');if(v&&reduce)v.removeAttribute('autoplay');`,
    foot: null,
  };
}
