import { describe, expect, it } from 'vitest';
import {
  addDays,
  cancelOccurrence,
  editOccurrence,
  endSeriesBefore,
  isOccurrence,
  occurrenceDates,
  splitSeries,
  weekStart,
  type Series,
} from './recurrence';

// 2026-08-02 é domingo.
describe('datas', () => {
  it('soma dias atravessando mês e ano, e acha o domingo da semana', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekStart('2026-08-05')).toBe('2026-08-02');
    expect(weekStart('2026-08-02')).toBe('2026-08-02');
  });
});

describe('occurrenceDates', () => {
  it('evento único: só no próprio dia', () => {
    expect(occurrenceDates('2026-08-05', null, '2026-08-01', '2026-08-31')).toEqual(['2026-08-05']);
    expect(occurrenceDates('2026-08-05', null, '2026-08-06', '2026-08-31')).toEqual([]);
  });

  it('semanal em vários dias (academia ter, qua e qui; ROT-04)', () => {
    const rule = { freq: 'weekly' as const, weekdays: [2, 3, 4] };
    expect(occurrenceDates('2026-08-04', rule, '2026-08-02', '2026-08-15')).toEqual([
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
    ]);
  });

  it('semanal começa no próprio início, não antes', () => {
    const rule = { freq: 'weekly' as const, weekdays: [1, 3] };
    expect(occurrenceDates('2026-08-05', rule, '2026-08-02', '2026-08-12')).toEqual([
      '2026-08-05',
      '2026-08-10',
      '2026-08-12',
    ]);
  });

  it('semanal sem dias usa o dia da primeira ocorrência; quinzenal mantém as semanas', () => {
    expect(
      occurrenceDates('2026-08-05', { freq: 'weekly', weekdays: [] }, '2026-08-01', '2026-08-20'),
    ).toEqual(['2026-08-05', '2026-08-12', '2026-08-19']);
    const biweekly = { freq: 'weekly' as const, weekdays: [3], interval: 2 };
    expect(occurrenceDates('2026-08-05', biweekly, '2026-08-01', '2026-09-10')).toEqual([
      '2026-08-05',
      '2026-08-19',
      '2026-09-02',
    ]);
    // Janela começando bem depois: o salto mantém o alinhamento das semanas.
    expect(occurrenceDates('2026-08-05', biweekly, '2026-12-01', '2026-12-31')).toEqual([
      '2026-12-09',
      '2026-12-23',
    ]);
  });

  it('respeita até e contagem (a contagem vale desde o início)', () => {
    const until = { freq: 'daily' as const, until: '2026-08-07' };
    expect(occurrenceDates('2026-08-05', until, '2026-08-01', '2026-08-31')).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
    const count = { freq: 'weekly' as const, weekdays: [1, 3], count: 3 };
    expect(occurrenceDates('2026-08-03', count, '2026-08-06', '2026-09-30')).toEqual([
      '2026-08-10',
    ]);
  });

  it('diário com intervalo e janela no meio', () => {
    const rule = { freq: 'daily' as const, interval: 3 };
    expect(occurrenceDates('2026-08-01', rule, '2026-08-05', '2026-08-12')).toEqual([
      '2026-08-07',
      '2026-08-10',
    ]);
  });

  it('mensal pula o mês sem o dia (31)', () => {
    expect(occurrenceDates('2026-01-31', { freq: 'monthly' }, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
  });

  it('datas específicas: ordena e tira repetidas', () => {
    const rule = { freq: 'dates' as const, dates: ['2026-09-10', '2026-08-20', '2026-09-10'] };
    expect(occurrenceDates('2026-08-20', rule, '2026-08-01', '2026-12-31')).toEqual([
      '2026-08-20',
      '2026-09-10',
    ]);
  });

  it('regra sem fim não gera lista infinita', () => {
    const all = occurrenceDates('2026-01-01', { freq: 'daily' }, '2026-01-01', '2100-01-01');
    expect(all.length).toBe(5000);
  });
});

describe('edição de série (CAL-04)', () => {
  const gym: Series = {
    startDate: '2026-08-04',
    rule: { freq: 'weekly', weekdays: [2, 4], count: 6 },
  };

  it('só esta: exceção na data; data que não é ocorrência é recusada', () => {
    const s = editOccurrence(gym, '2026-08-06', { start: '20:00' });
    expect(s.exceptions).toEqual([{ date: '2026-08-06', change: { start: '20:00' } }]);
    const again = editOccurrence(s, '2026-08-06', { start: '21:00' });
    expect(again.exceptions).toHaveLength(1);
    expect(() => editOccurrence(gym, '2026-08-05', {})).toThrow();
    expect(cancelOccurrence(gym, '2026-08-11').exceptions).toEqual([
      { date: '2026-08-11', cancelled: true },
    ]);
  });

  it('esta e as próximas: divide sem perder nem repetir ocorrência', () => {
    const withEx = cancelOccurrence(cancelOccurrence(gym, '2026-08-06'), '2026-08-13');
    const { before, after } = splitSeries(withEx, '2026-08-11');
    const all = (s: Series) => occurrenceDates(s.startDate, s.rule, '2026-01-01', '2026-12-31');
    expect(all(before!)).toEqual(['2026-08-04', '2026-08-06']);
    expect(all(after)).toEqual(['2026-08-11', '2026-08-13', '2026-08-18', '2026-08-20']);
    expect(before!.exceptions!.map((e) => e.date)).toEqual(['2026-08-06']);
    expect(after.exceptions!.map((e) => e.date)).toEqual(['2026-08-13']);
  });

  it('dividir na primeira ocorrência vale para a série toda', () => {
    const { before, after } = splitSeries(gym, '2026-08-04');
    expect(before).toBeNull();
    expect(after).toBe(gym);
  });

  it('quinzenal dividido continua nas mesmas semanas', () => {
    const s: Series = {
      startDate: '2026-08-05',
      rule: { freq: 'weekly', weekdays: [3], interval: 2 },
    };
    const { after } = splitSeries(s, '2026-09-02');
    expect(occurrenceDates(after.startDate, after.rule, '2026-09-01', '2026-10-01')).toEqual([
      '2026-09-02',
      '2026-09-16',
      '2026-09-30',
    ]);
  });

  it('datas específicas também dividem', () => {
    const s: Series = {
      startDate: '2026-08-20',
      rule: { freq: 'dates', dates: ['2026-08-20', '2026-09-10', '2026-10-01'] },
    };
    const { before, after } = splitSeries(s, '2026-09-10');
    expect(before!.rule).toEqual({ freq: 'dates', dates: ['2026-08-20'] });
    expect(after.rule).toEqual({ freq: 'dates', dates: ['2026-09-10', '2026-10-01'] });
  });

  it('excluir esta e as próximas encerra na véspera', () => {
    const s = endSeriesBefore(gym, '2026-08-13')!;
    expect(isOccurrence(s, '2026-08-11')).toBe(true);
    expect(isOccurrence(s, '2026-08-13')).toBe(false);
    expect(endSeriesBefore(gym, '2026-08-04')).toBeNull();
  });
});
