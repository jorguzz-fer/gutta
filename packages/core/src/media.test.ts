import { describe, expect, it } from 'vitest';
import {
  buildAss,
  captionsFromAlignment,
  estimatedAlignment,
  fullNarration,
  sceneLabels,
  sceneTimings,
  validateStoryboard,
  videoPieceBlocks,
  VIDEO_SRC_PLACEHOLDER,
  type Storyboard,
} from './media';
import { lintErrors, lintPiece } from './piece';

// Vídeo da insulina (Aula 1, peça 9): zoom do corpo ao núcleo da célula β.
const sb: Storyboard = {
  title: 'Como a célula β fabrica insulina',
  scenes: [
    {
      id: 'corpo',
      narration: 'Vamos do corpo inteiro até o pâncreas.',
      imagePrompt: 'Adulto em pé, vista frontal, abdome em destaque, sem texto.',
      motionPrompt: 'Zoom lento em direção ao abdome.',
      labels: ['Pâncreas'],
      referenceScene: null,
    },
    {
      id: 'celula-beta',
      narration: 'Na ilhota, a célula β transcreve o gene da insulina.',
      imagePrompt: 'Ilhota pancreática em microscopia, célula beta em destaque, sem texto.',
      motionPrompt: 'Aproximação até o núcleo.',
      labels: ['Célula β', 'Núcleo'],
      referenceScene: 'corpo',
    },
  ],
};

describe('roteiro', () => {
  it('aceita um roteiro bom e aponta os problemas de um ruim', () => {
    expect(validateStoryboard(sb)).toEqual([]);
    const bad: Storyboard = {
      title: 'x',
      scenes: [
        { ...sb.scenes[1]!, id: 'Cena 1', narration: ' ', referenceScene: 'depois' },
        { ...sb.scenes[0]!, labels: ['x'.repeat(50)] },
      ],
    };
    expect(validateStoryboard(bad)).toEqual([
      'Identificador de cena inválido: "Cena 1".',
      'A cena "Cena 1" não tem narração.',
      'A cena "Cena 1" usa como referência uma cena que não vem antes dela.',
      `Rótulo longo demais na cena "corpo": "${'x'.repeat(50)}".`,
    ]);
    expect(validateStoryboard({ title: 'x', scenes: [] })).toEqual(['O roteiro não tem cenas.']);
  });

  it('a narração completa junta as falas na ordem', () => {
    expect(fullNarration(sb)).toBe(
      'Vamos do corpo inteiro até o pâncreas. Na ilhota, a célula β transcreve o gene da insulina.',
    );
  });
});

describe('tempo das cenas e legendas', () => {
  const al = estimatedAlignment(fullNarration(sb), 10);

  it('cada cena vai do começo da sua fala até o começo da próxima', () => {
    const t = sceneTimings(sb, al, 9.4);
    expect(t).toEqual([
      { id: 'corpo', start: 0, end: 3.9 },
      { id: 'celula-beta', start: 3.9, end: 9.4 },
    ]);
  });

  it('a legenda sai do texto autoral, quebrada em frases curtas, com o tempo do alinhamento', () => {
    const caps = captionsFromAlignment(al, 30);
    expect(caps.map((c) => c.text)).toEqual([
      'Vamos do corpo inteiro até o',
      'pâncreas.',
      'Na ilhota, a célula β',
      'transcreve o gene da insulina.',
    ]);
    expect(caps[0]!.start).toBe(0);
    expect(caps.at(-1)!.end).toBeCloseTo(al.character_end_times_seconds.at(-1)!, 3);
    for (let i = 1; i < caps.length; i++)
      expect(caps[i]!.start).toBeGreaterThanOrEqual(caps[i - 1]!.end);
  });

  it('o arquivo ASS tem a legenda embaixo e os rótulos de cada cena no alto', () => {
    const t = sceneTimings(sb, al, 9.4);
    const ass = buildAss({
      width: 1280,
      height: 720,
      captions: captionsFromAlignment(al, 30),
      labels: sceneLabels(sb, t),
    });
    expect(ass).toContain('PlayResX: 1280');
    expect(ass).toContain('Dialogue: 1,0:00:03.90,0:00:09.40,Rotulo,,0,0,0,,Célula β\\NNúcleo');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,');
    expect(ass).toContain(',Legenda,,0,0,0,,pâncreas.');
  });
});

describe('peça de vídeo', () => {
  it('segue a estrutura das peças e passa no linter', () => {
    const b = videoPieceBlocks({
      title: 'Como a célula β fabrica insulina',
      theme: 'Mensageiros químicos',
      lead: 'Assista ao zoom do corpo ao núcleo.',
      fixar: 'A insulina é uma proteína: transcrição, tradução e processamento no Golgi.',
      naProva: 'O peptídeo C mede a secreção endógena de insulina.',
      storyboard: sb,
    });
    expect(lintErrors(lintPiece(b))).toEqual([]);
    expect(b.body).toContain(`src="${VIDEO_SRC_PLACEHOLDER}"`);
    expect(b.body).toContain('<li>Vamos do corpo inteiro até o pâncreas.</li>');
  });
});
