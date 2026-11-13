import { describe, expect, it } from 'vitest';
import { costMicros } from '../src/pricing';
import { FakeScheduleExtractor, ScheduleExtraction, type ScheduleEvent } from '../src/schedule';
import { scoreSchedule, similarity } from '../src/schedule-score';

const ev = (
  p: Partial<ScheduleEvent> & Pick<ScheduleEvent, 'date' | 'type' | 'title'>,
): ScheduleEvent => ({
  start: null,
  end: null,
  topic: null,
  teacher: null,
  location: null,
  confidence: 'alta',
  source: '',
  note: null,
  ...p,
});

describe('extração de teste', () => {
  it('lê linhas de cronograma e deduz o ano quando falta', async () => {
    const r = await new FakeScheduleExtractor().extract({
      referenceYear: 2026,
      text: '12/11 08:00-10:00 Aula: Inflamação aguda\n19/11/2026 Prova: P1\nlinha qualquer',
    });
    expect(ScheduleExtraction.parse(r.data)).toBeTruthy();
    expect(r.data.events).toEqual([
      expect.objectContaining({
        date: '2026-11-12',
        start: '08:00',
        end: '10:00',
        type: 'aula',
        confidence: 'media',
      }),
      expect.objectContaining({
        date: '2026-11-19',
        type: 'prova',
        title: 'P1',
        confidence: 'alta',
      }),
    ]);
  });
});

describe('pontuação', () => {
  it('semelhança ignora acento, caixa e pontuação', () => {
    expect(similarity('Inflamação Aguda', 'inflamacao aguda.')).toBe(1);
    expect(similarity('Prova 1', 'Avaliação final')).toBe(0);
  });

  it('mede recall, precisão e acerto por campo', () => {
    const expected = [
      {
        date: '2026-11-12',
        type: 'aula' as const,
        title: 'Inflamação aguda',
        start: '08:00',
        teacher: 'Dra. Juliana',
      },
      { date: '2026-11-19', type: 'prova' as const, title: 'P1', start: null },
      { date: '2026-11-26', type: 'aula' as const, title: 'Reparo tecidual' },
    ];
    const got = [
      ev({
        date: '2026-11-12',
        type: 'aula',
        title: 'Inflamação aguda e crônica',
        start: '08:00',
        teacher: 'Juliana',
      }),
      ev({ date: '2026-11-19', type: 'prova', title: 'P1', start: '08:00' }),
      ev({ date: '2026-11-20', type: 'outro', title: 'Feriado' }),
    ];
    const s = scoreSchedule(expected, got);
    expect(s).toMatchObject({ expected: 3, extracted: 3, matched: 2 });
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.precision).toBeCloseTo(2 / 3);
    expect(s.fields.start).toEqual({ right: 1, total: 2 }); // inventou hora na prova
    expect(s.fields.title).toEqual({ right: 2, total: 2 });
    expect(s.fields.teacher).toEqual({ right: 1, total: 1 }); // "Juliana" basta para "Dra. Juliana"
    expect(s.missing.map((m) => m.title)).toEqual(['Reparo tecidual']);
    expect(s.extra.map((m) => m.title)).toEqual(['Feriado']);
  });
});

describe('custo', () => {
  it('estima pela tabela do modelo', () => {
    expect(
      costMicros('claude-opus-5-5', { input: 10_000, output: 2_000, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(80_000);
    expect(
      costMicros('claude-sonnet-5-5', { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 }),
    ).toBe(100_000);
  });
});
