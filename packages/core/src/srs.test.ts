import { describe, expect, it } from 'vitest';
import { NEW_CARD, addLocalDays, previewIntervals, schedule, type SrsState } from './srs';
import { localDayKey } from './time';

const SP = 'America/Sao_Paulo';
const now = new Date('2026-11-10T15:00:00Z'); // 12h em SP

describe('revisão espaçada', () => {
  it('cartão novo: bom = amanhã às 4h locais; fácil = 4 dias', () => {
    const good = schedule(NEW_CARD, 2, now, SP);
    expect(good.intervalDays).toBe(1);
    expect(good.dueAt.toISOString()).toBe('2026-11-11T07:00:00.000Z');
    expect(schedule(NEW_CARD, 3, now, SP).intervalDays).toBe(4);
  });

  it('esqueci volta em 10 minutos, zera a sequência e conta lapso', () => {
    const s: SrsState = { repetitions: 4, intervalDays: 20, ease: 2.5, lapses: 0 };
    const r = schedule(s, 0, now, SP);
    expect(r.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 0, lapses: 1, ease: 2.3 });
  });

  it('sequência de "bom": 1, 4, depois intervalo × facilidade', () => {
    let s: SrsState = NEW_CARD;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = schedule(s, 2, now, SP);
      intervals.push(r.intervalDays);
      s = r;
    }
    expect(intervals).toEqual([1, 4, 10, 25]);
  });

  it('difícil cresce pouco e baixa a facilidade; facilidade tem piso', () => {
    const s: SrsState = { repetitions: 3, intervalDays: 10, ease: 1.35, lapses: 2 };
    const r = schedule(s, 1, now, SP);
    expect(r.intervalDays).toBe(12);
    expect(r.ease).toBe(1.3);
  });

  it('intervalo nunca passa de um ano', () => {
    const s: SrsState = { repetitions: 10, intervalDays: 300, ease: 3, lapses: 0 };
    expect(schedule(s, 3, now, SP).intervalDays).toBe(365);
  });

  it('vencimento respeita o dia local mesmo perto da meia-noite', () => {
    const lateNight = new Date('2026-11-11T02:30:00Z'); // 23h30 do dia 10 em SP
    const r = schedule(NEW_CARD, 2, lateNight, SP);
    expect(localDayKey(r.dueAt, SP)).toBe('2026-11-11');
    expect(addLocalDays(lateNight, 0, SP).toISOString()).toBe('2026-11-10T07:00:00.000Z');
  });

  it('prévia dos botões', () => {
    expect(previewIntervals(NEW_CARD, now, SP)).toEqual({
      0: '10 min',
      1: '1 dia',
      2: '1 dia',
      3: '4 dias',
    });
  });
});
