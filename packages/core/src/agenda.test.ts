import { describe, expect, it } from 'vitest';
import {
  isAcademic,
  minutesBy,
  overlapping,
  projectAgenda,
  weekBounds,
  type SeriesItem,
  type SingleItem,
} from './agenda';

const TZ = 'America/Sao_Paulo'; // UTC-3, sem horário de verão desde 2019
const week = weekBounds('2026-08-05', TZ); // domingo 02/08 a sábado 08/08

const lesson = (over: Partial<SingleItem> = {}): SingleItem => ({
  source: 'lesson',
  sourceId: 'l1',
  kind: 'aula',
  title: 'Inflamação aguda',
  disciplineId: 'd1',
  protected: true,
  blocksTime: true,
  start: new Date('2026-08-04T11:00:00Z'),
  end: new Date('2026-08-04T13:00:00Z'),
  allDay: false,
  ...over,
});

const block = (over: Partial<SeriesItem> = {}): SeriesItem => ({
  source: 'routine',
  sourceId: 'r1',
  kind: 'estudo',
  title: 'Estudo',
  protected: false,
  studyWindow: true,
  blocksTime: true,
  startDate: '2026-08-02',
  rule: { freq: 'weekly', weekdays: [1, 3, 5] },
  startTime: '14:00',
  durationMinutes: 120,
  ...over,
});

describe('weekBounds', () => {
  it('domingo a sábado no fuso do aluno', () => {
    expect(week.from.toISOString()).toBe('2026-08-02T03:00:00.000Z');
    expect(week.to.toISOString()).toBe('2026-08-09T03:00:00.000Z');
    expect(week.days[0]).toBe('2026-08-02');
    expect(week.days[6]).toBe('2026-08-08');
  });
});

describe('projectAgenda', () => {
  it('junta fatos datados e séries no mesmo formato, em ordem', () => {
    const occ = projectAgenda({
      tz: TZ,
      ...week,
      singles: [lesson()],
      series: [block()],
    });
    expect(occ.map((o) => [o.source, o.date, o.start.toISOString()])).toEqual([
      ['routine', '2026-08-03', '2026-08-03T17:00:00.000Z'],
      ['lesson', '2026-08-04', '2026-08-04T11:00:00.000Z'],
      ['routine', '2026-08-05', '2026-08-05T17:00:00.000Z'],
      ['routine', '2026-08-07', '2026-08-07T17:00:00.000Z'],
    ]);
    expect(occ[0]).toMatchObject({ id: 'routine:r1:2026-08-03', studyWindow: true });
    expect(occ[1]).toMatchObject({ id: 'lesson:l1', protected: true });
  });

  it('nada fora da janela; prova sem fim aparece no instante dela', () => {
    const occ = projectAgenda({
      tz: TZ,
      ...week,
      singles: [
        lesson({ sourceId: 'antes', start: new Date('2026-08-01T11:00:00Z'), end: null }),
        lesson({
          source: 'assessment',
          sourceId: 'p1',
          kind: 'prova',
          start: new Date('2026-08-06T22:00:00Z'),
          end: null,
        }),
      ],
    });
    expect(occ.map((o) => o.sourceId)).toEqual(['p1']);
    expect(occ[0]!.end).toEqual(occ[0]!.start);
  });

  it('dia inteiro ocupa o dia local', () => {
    const [o] = projectAgenda({
      tz: TZ,
      ...week,
      singles: [lesson({ allDay: true, start: new Date('2026-08-07T03:00:00Z'), end: null })],
    });
    expect(o!.date).toBe('2026-08-07');
    expect(o!.end.getTime() - o!.start.getTime()).toBe(24 * 3600_000);
  });

  it('sono das 23:00 às 07:00 aparece no domingo, vindo do sábado anterior', () => {
    const sleep = block({
      sourceId: 'sono',
      kind: 'pessoal',
      category: 'sono',
      protected: true,
      studyWindow: false,
      rule: { freq: 'daily' },
      startDate: '2026-07-01',
      startTime: '23:00',
      durationMinutes: 480,
    });
    const occ = projectAgenda({ tz: TZ, ...week, series: [sleep] });
    expect(occ[0]!.date).toBe('2026-08-01'); // começou no sábado anterior
    expect(occ).toHaveLength(8);
    const mins = minutesBy(occ, week.from, week.to, (o) => o.category ?? null);
    // Dentro da semana: 7 h da noite que vem do sábado anterior, 6 noites inteiras e 1 h
    // (23:00 a 24:00) da noite que começa no último sábado.
    expect(mins.sono).toBe(7 * 60 + 6 * 480 + 60);
  });

  it('exceções: só esta cancelada, só esta remarcada (até para outra semana)', () => {
    const s = block({
      exceptions: [
        { date: '2026-08-03', cancelled: true },
        { date: '2026-08-05', change: { start: '16:00', durationMinutes: 60, title: 'Revisão' } },
        { date: '2026-08-07', change: { date: '2026-08-10' } },
        { date: '2026-08-12', change: { date: '2026-08-08' } },
      ],
    });
    const occ = projectAgenda({ tz: TZ, ...week, series: [s] });
    expect(occ.map((o) => [o.originalDate, o.date, o.title, o.modified])).toEqual([
      ['2026-08-05', '2026-08-05', 'Revisão', true],
      ['2026-08-12', '2026-08-08', 'Estudo', true],
    ]);
    expect(occ[0]!.end.getTime() - occ[0]!.start.getTime()).toBe(60 * 60_000);
  });

  it('horário local fixo mesmo com horário de verão (Nova York, novembro)', () => {
    const ny = 'America/New_York';
    const w = weekBounds('2026-11-01', ny); // o horário de verão acaba no domingo 01/11
    const occ = projectAgenda({
      tz: ny,
      ...w,
      series: [block({ startDate: '2026-10-25', rule: { freq: 'daily' }, startTime: '09:00' })],
    });
    expect(occ[0]!.start.toISOString()).toBe('2026-11-01T14:00:00.000Z');
    expect(
      occ.every(
        (o) => new Date(o.start).toLocaleTimeString('en-GB', { timeZone: ny }) === '09:00:00',
      ),
    ).toBe(true);
  });
});

describe('resumos', () => {
  it('soma por tipo sem contar dia inteiro (ROT-12)', () => {
    const occ = projectAgenda({
      tz: TZ,
      ...week,
      singles: [lesson(), lesson({ sourceId: 'x', allDay: true, start: week.from, end: null })],
      series: [block()],
    });
    expect(minutesBy(occ, week.from, week.to, (o) => o.kind)).toEqual({ aula: 120, estudo: 360 });
  });

  it('aponta sobreposição entre o que ocupa horário', () => {
    const occ = projectAgenda({
      tz: TZ,
      ...week,
      singles: [
        lesson({ start: new Date('2026-08-03T16:00:00Z'), end: new Date('2026-08-03T18:00:00Z') }),
      ],
      series: [block()],
    });
    const pairs = overlapping(occ);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.map((o) => o.source)).toEqual(['lesson', 'routine']);
  });

  it('acadêmico e pessoal são distintos (CAL-15)', () => {
    expect(isAcademic('prova')).toBe(true);
    expect(isAcademic('pessoal')).toBe(false);
  });
});
