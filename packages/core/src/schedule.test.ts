import { describe, expect, it } from 'vitest';
import {
  changedFields,
  diffSchedule,
  normalizeScheduleItem,
  scheduleItemErrors,
  scheduleTarget,
  textSimilarity,
  type ImportedEvent,
  type ScheduleItem,
} from './schedule';

const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  date: '2026-08-10',
  start: '08:00',
  end: '10:00',
  type: 'aula',
  title: 'Inflamação aguda',
  topic: null,
  teacher: null,
  location: null,
  ...over,
});

const ev = (id: string, over: Partial<ScheduleItem> = {}, modified = false): ImportedEvent => ({
  id,
  table: 'lesson',
  original: item(over),
  modifiedByStudent: modified,
});

describe('scheduleTarget', () => {
  it('aula, prática e outro vão para a grade; prova, atividade e entrega são avaliação', () => {
    expect(scheduleTarget('aula')).toEqual({ table: 'lesson', kind: 'aula' });
    expect(scheduleTarget('pratica')).toEqual({ table: 'lesson', kind: 'pratica' });
    expect(scheduleTarget('outro')).toEqual({ table: 'lesson', kind: 'outro' });
    expect(scheduleTarget('prova')).toEqual({ table: 'assessment', kind: 'prova' });
    expect(scheduleTarget('entrega').table).toBe('assessment');
  });
});

describe('scheduleItemErrors', () => {
  it('aceita item completo e item sem hora', () => {
    expect(scheduleItemErrors(item())).toEqual([]);
    expect(scheduleItemErrors(item({ start: null, end: null }))).toEqual([]);
  });
  it('recusa data impossível, hora inválida, fim antes do início e título vazio', () => {
    expect(scheduleItemErrors(item({ date: '2026-02-30' }))).toContain('date');
    expect(scheduleItemErrors(item({ start: '25:00' }))).toContain('start');
    expect(scheduleItemErrors(item({ start: '10:00', end: '09:00' }))).toContain(
      'end_before_start',
    );
    expect(scheduleItemErrors(item({ start: null, end: '09:00' }))).toContain('end_without_start');
    expect(scheduleItemErrors(item({ title: '  ' }))).toContain('title');
  });
});

describe('comparação de textos', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(textSimilarity('Inflamação Aguda', 'inflamacao aguda.')).toBe(1);
    expect(changedFields(item(), item({ title: 'INFLAMACAO AGUDA', teacher: ' ' }))).toEqual([]);
    expect(normalizeScheduleItem(item({ teacher: '  Dra.   Juliana ' })).teacher).toBe(
      'Dra. Juliana',
    );
  });
});

describe('diffSchedule (DIS-07)', () => {
  it('primeira importação: tudo incluído', () => {
    const d = diffSchedule([], [item(), item({ date: '2026-08-17' })]);
    expect(d.added).toHaveLength(2);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('mesmo cronograma de novo: nada muda', () => {
    const d = diffSchedule(
      [ev('a'), ev('b', { date: '2026-08-17' })],
      [item({ date: '2026-08-17' }), item()],
    );
    expect(d.unchanged.map((u) => u.event.id).sort()).toEqual(['a', 'b']);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('hora trocada e sala nova aparecem como alteração, com os campos', () => {
    const d = diffSchedule([ev('a')], [item({ start: '09:00', end: '11:00', location: 'Sala 3' })]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]!.fields).toEqual(['start', 'end', 'location']);
    expect(d.changed[0]!.keepStudent).toBe(false);
  });

  it('aula remarcada para outra data casa pelo título', () => {
    const d = diffSchedule(
      [ev('a', { title: 'Choque séptico' })],
      [item({ title: 'Choque séptico', date: '2026-08-12' })],
    );
    expect(d.changed[0]!.event.id).toBe('a');
    expect(d.changed[0]!.fields).toEqual(['date']);
    expect(d.added).toEqual([]);
  });

  it('item que sumiu é removido; item novo é incluído', () => {
    const d = diffSchedule(
      [ev('a'), ev('p', { type: 'prova', title: 'P1', date: '2026-09-14' })],
      [item(), item({ type: 'entrega', title: 'Relatório', date: '2026-09-20' })],
    );
    expect(d.removed.map((r) => r.event.id)).toEqual(['p']);
    expect(d.added.map((a) => a.title)).toEqual(['Relatório']);
  });

  it('no mesmo dia, casa pelo título mais parecido', () => {
    const d = diffSchedule(
      [ev('a', { title: 'Anatomia do coração' }), ev('b', { title: 'Fisiologia renal' })],
      [item({ title: 'Fisiologia renal II' }), item({ title: 'Anatomia do coração' })],
    );
    expect(d.unchanged.map((u) => u.event.id)).toEqual(['a']);
    expect(d.changed.map((c) => c.event.id)).toEqual(['b']);
  });

  it('evento editado pelo aluno é sinalizado, não sobrescrito nem removido', () => {
    const d = diffSchedule(
      [ev('a', {}, true), ev('b', { date: '2026-08-17' }, true)],
      [item({ start: '09:00', end: '11:00' })],
    );
    expect(d.changed[0]).toMatchObject({ keepStudent: true });
    expect(d.removed[0]).toMatchObject({ keepStudent: true });
  });

  it('mudança de tipo (aula vira prova) é remoção mais inclusão', () => {
    const d = diffSchedule([ev('a')], [item({ type: 'prova' })]);
    expect(d.removed).toHaveLength(1);
    expect(d.added).toHaveLength(1);
  });
});
