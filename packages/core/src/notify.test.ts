import { describe, expect, it } from 'vitest';
import { academicAlerts, inQuietHours, localMinute } from './notify';

const TZ = 'America/Sao_Paulo';

describe('horário silencioso (LEM-12)', () => {
  it('no mesmo dia e atravessando a meia-noite', () => {
    expect(inQuietHours(13 * 60, 12 * 60, 14 * 60)).toBe(true);
    expect(inQuietHours(14 * 60, 12 * 60, 14 * 60)).toBe(false);
    expect(inQuietHours(23 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(6 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(8 * 60, 22 * 60, 7 * 60)).toBe(false);
    expect(inQuietHours(8 * 60, null, null)).toBe(false);
  });
  it('minuto local no fuso do aluno', () => {
    expect(localMinute(new Date('2026-08-10T11:30:00Z'), TZ)).toBe(8 * 60 + 30);
  });
});

describe('alertas acadêmicos (LEM-15)', () => {
  const now = new Date('2026-08-09T12:00:00Z'); // domingo, 09:00 em São Paulo
  it('aula 30 min antes; prova na véspera às 9h; o que passou não avisa', () => {
    const alerts = academicAlerts(
      [
        {
          kind: 'lesson',
          id: 'l1',
          title: 'Inflamação aguda',
          discipline: 'Fisiopatologia',
          start: new Date('2026-08-10T11:00:00Z'),
          allDay: false,
          lessonKind: 'aula',
        },
        {
          kind: 'lesson',
          id: 'velha',
          title: 'Já foi',
          discipline: 'Fisiopatologia',
          start: new Date('2026-08-08T11:00:00Z'),
          allDay: false,
          lessonKind: 'aula',
        },
        {
          kind: 'lesson',
          id: 'feriado',
          title: 'Recesso',
          discipline: 'Fisiopatologia',
          start: new Date('2026-08-11T03:00:00Z'),
          allDay: true,
          lessonKind: 'outro',
        },
        {
          kind: 'assessment',
          id: 'p1',
          name: 'P1',
          discipline: 'Anatomia',
          due: new Date('2026-08-14T22:00:00Z'),
          allDay: false,
          assessmentKind: 'prova',
        },
        {
          kind: 'assessment',
          id: 'rel',
          name: 'Relatório',
          discipline: 'Anatomia',
          due: new Date('2026-08-20T03:00:00Z'),
          allDay: true,
          assessmentKind: 'entrega',
        },
      ],
      now,
      TZ,
    );
    expect(alerts.map((a) => [a.dedupeKey, a.title, a.scheduledFor.toISOString()])).toEqual([
      [
        'lesson:l1:2026-08-10T11:00:00.000Z',
        'Aula de Fisiopatologia às 08:00',
        '2026-08-10T10:30:00.000Z',
      ],
      [
        'assessment:p1:2026-08-14T22:00:00.000Z',
        'Prova de Anatomia amanhã às 19:00',
        '2026-08-13T12:00:00.000Z',
      ],
      [
        'assessment:rel:2026-08-20T03:00:00.000Z',
        'Entrega de Anatomia amanhã',
        '2026-08-19T12:00:00.000Z',
      ],
    ]);
  });

  it('prova amanhã cedo, criada agora: avisa já, sem data no passado', () => {
    const [a] = academicAlerts(
      [
        {
          kind: 'assessment',
          id: 'p2',
          name: 'P2',
          discipline: 'Anatomia',
          due: new Date('2026-08-09T20:00:00Z'),
          allDay: false,
          assessmentKind: 'prova',
        },
      ],
      now,
      TZ,
    );
    expect(a!.scheduledFor).toEqual(now);
  });
});
