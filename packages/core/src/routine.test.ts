import { describe, expect, it } from 'vitest';
import { projectAgenda, weekBounds, type SingleItem } from './agenda';
import {
  durationBetween,
  goalStatus,
  hmToMinute,
  minuteToHm,
  routineConflicts,
  routineSeries,
  routineSummary,
  type RoutineBlock,
} from './routine';

const TZ = 'America/Sao_Paulo';
const block = (over: Partial<RoutineBlock> = {}): RoutineBlock => ({
  id: 'b1',
  kind: 'estudo',
  category: null,
  label: 'Estudo',
  disciplineId: null,
  color: null,
  weekdays: [1, 3],
  startMinute: 14 * 60,
  durationMinutes: 120,
  validFrom: '2026-01-01',
  validUntil: null,
  ...over,
});

describe('horas', () => {
  it('converte e mede intervalos que passam da meia-noite', () => {
    expect(minuteToHm(19 * 60 + 5)).toBe('19:05');
    expect(hmToMinute('07:30')).toBe(450);
    expect(hmToMinute('24:00')).toBeNull();
    expect(durationBetween(23 * 60, 7 * 60)).toBe(480);
    expect(durationBetween(22 * 60, 0)).toBe(120);
    expect(durationBetween(8 * 60, 10 * 60)).toBe(120);
  });
});

describe('conflitos (a rotina não sobrepõe)', () => {
  const gym = block({
    id: 'gym',
    kind: 'pessoal',
    weekdays: [2, 3, 4],
    startMinute: 1140,
    durationMinutes: 60,
  });
  it('mesmo dia e horário cruzado conflita; encostar não', () => {
    expect(
      routineConflicts(block({ weekdays: [3], startMinute: 1170, durationMinutes: 60 }), [gym]),
    ).toEqual([gym]);
    expect(
      routineConflicts(block({ weekdays: [3], startMinute: 1200, durationMinutes: 60 }), [gym]),
    ).toEqual([]);
    expect(routineConflicts(block({ weekdays: [1, 5], startMinute: 1140 }), [gym])).toEqual([]);
  });
  it('sono de sábado invade o domingo de manhã', () => {
    const sleep = block({ id: 'sono', weekdays: [6], startMinute: 23 * 60, durationMinutes: 480 });
    expect(
      routineConflicts(block({ weekdays: [0], startMinute: 360, durationMinutes: 60 }), [sleep]),
    ).toEqual([sleep]);
  });
  it('editar o próprio bloco não conflita com ele mesmo', () => {
    expect(routineConflicts({ ...gym, startMinute: 1150 }, [gym])).toEqual([]);
  });
});

describe('resumo e meta (ROT-09 a ROT-13)', () => {
  const week = weekBounds('2026-08-05', TZ);
  const lesson: SingleItem = {
    source: 'lesson',
    sourceId: 'l1',
    kind: 'aula',
    title: 'Anatomia',
    protected: true,
    blocksTime: true,
    start: new Date('2026-08-04T11:00:00Z'),
    end: new Date('2026-08-04T13:00:00Z'),
    allDay: false,
  };
  it('soma aulas, estudo e outras atividades; sono fica de fora', () => {
    const occ = projectAgenda({
      tz: TZ,
      ...week,
      singles: [lesson],
      series: [
        routineSeries(block()),
        routineSeries(
          block({
            id: 'mad',
            kind: 'aula',
            label: 'MAD',
            disciplineId: 'd',
            weekdays: [5],
            startMinute: 480,
            durationMinutes: 240,
          }),
        ),
        routineSeries(
          block({
            id: 'gym',
            kind: 'pessoal',
            category: 'academia',
            weekdays: [2, 4],
            startMinute: 1140,
            durationMinutes: 60,
          }),
        ),
        routineSeries(
          block({
            id: 'sono',
            kind: 'pessoal',
            category: 'sono',
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            startMinute: 1380,
            durationMinutes: 480,
          }),
        ),
      ],
    });
    expect(routineSummary(occ, week.from, week.to)).toEqual({
      classMinutes: 120 + 240,
      studyMinutes: 240,
      otherMinutes: 120,
      totalMinutes: 720,
    });
  });

  it('bloco de estudo é a única janela do planejamento; aula e pessoal são protegidos', () => {
    expect(routineSeries(block())).toMatchObject({ studyWindow: true, protected: false });
    expect(routineSeries(block({ kind: 'pessoal' }))).toMatchObject({
      studyWindow: false,
      protected: true,
    });
    expect(routineSeries(block({ kind: 'aula', disciplineId: 'd' }))).toMatchObject({
      protected: true,
    });
  });

  it('frase da meta informa sem cobrar', () => {
    expect(goalStatus(1200, 1020)).toMatchObject({
      percent: 85,
      missingMinutes: 180,
      message: 'Sua rotina soma 17 horas de estudo. Faltam 3 horas para a sugestão de 20 horas.',
    });
    expect(goalStatus(1200, 1500)).toMatchObject({ percent: 100, extraMinutes: 300 });
    expect(goalStatus(1200, 1500).message).toContain('dá para reduzir');
    expect(goalStatus(1200, 0).message).toContain('Marque na grade');
    expect(goalStatus(1200, 1230).message).toContain('20 h 30');
    expect(goalStatus(1200, 1200).message).toBe(
      'Sua rotina soma 20 horas de estudo, a sugestão da semana.',
    );
  });
});
