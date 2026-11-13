import { describe, expect, it } from 'vitest';
import { attendanceSummary } from './attendance';

describe('faltas (FAL-03)', () => {
  it('exemplo do documento: 80 h, 75%, limite 20, registradas 4, saldo 16', () => {
    expect(
      attendanceSummary({ totalClassHours: 80, minAttendancePct: 75, absences: [2, 2] }),
    ).toEqual({
      limit: 20,
      registered: 4,
      remaining: 16,
      usedPct: 20,
      status: 'dentro',
      reachedThresholds: [],
    });
  });

  it('limiares alcançados e situação', () => {
    const at = (h: number[]) =>
      attendanceSummary({ totalClassHours: 80, minAttendancePct: 75, absences: h });
    expect(at([10])).toMatchObject({ usedPct: 50, status: 'atencao', reachedThresholds: [50] });
    expect(at([16])).toMatchObject({ reachedThresholds: [50, 75] });
    expect(at([20])).toMatchObject({ status: 'no_limite', remaining: 0, usedPct: 100 });
    expect(at([22])).toMatchObject({ status: 'acima', remaining: 0, usedPct: 110 });
  });

  it('o limite é o configurado, com horas-aula parciais', () => {
    expect(
      attendanceSummary({
        totalClassHours: 68,
        minAttendancePct: 70,
        absences: [1.5, 1],
        thresholds: [25],
      }),
    ).toMatchObject({ limit: 20.4, registered: 2.5, remaining: 17.9, reachedThresholds: [] });
    expect(
      attendanceSummary({ totalClassHours: 40, minAttendancePct: 100, absences: [] }),
    ).toMatchObject({ limit: 0, usedPct: 0, status: 'dentro' });
  });
});
