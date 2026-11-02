import { describe, expect, it } from 'vitest';
import { endOfLocalDay, localDayKey, localDaysBetween, localWeekday, zonedTimeToUtc } from './time';

const SP = 'America/Sao_Paulo';

describe('datas no fuso do aluno', () => {
  it('23h em São Paulo ainda é o mesmo dia local, mesmo já sendo amanhã em UTC', () => {
    const d = new Date('2026-11-03T02:30:00Z'); // 23h30 do dia 2 em SP
    expect(localDayKey(d, SP)).toBe('2026-11-02');
    expect(localDayKey(d, 'UTC')).toBe('2026-11-03');
  });

  it('converte hora local para UTC', () => {
    expect(zonedTimeToUtc('2026-11-20', SP, 8).toISOString()).toBe('2026-11-20T11:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-20', 'UTC', 8).toISOString()).toBe('2026-11-20T08:00:00.000Z');
  });

  it('respeita horário de verão onde ele existe', () => {
    // Nova York: EDT (UTC-4) em julho, EST (UTC-5) em dezembro.
    expect(zonedTimeToUtc('2026-07-01', 'America/New_York', 9).toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-12-01', 'America/New_York', 9).toISOString()).toBe(
      '2026-12-01T14:00:00.000Z',
    );
  });

  it('fim do dia local', () => {
    const d = new Date('2026-11-02T15:00:00Z');
    expect(endOfLocalDay(d, SP).toISOString()).toBe('2026-11-03T03:00:00.000Z');
  });

  it('dias de calendário entre datas, pelo fuso', () => {
    const a = new Date('2026-11-02T02:00:00Z'); // 1/11 23h em SP
    const b = new Date('2026-11-02T04:00:00Z'); // 2/11 01h em SP
    expect(localDaysBetween(a, b, SP)).toBe(1);
    expect(localDaysBetween(b, a, SP)).toBe(-1);
  });

  it('dia da semana local', () => {
    expect(localWeekday(new Date('2026-11-02T12:00:00Z'), SP)).toBe(1); // segunda
    expect(localWeekday(new Date('2026-11-02T02:00:00Z'), SP)).toBe(0); // domingo 23h em SP
  });
});
