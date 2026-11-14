import { z } from 'zod';
import { defineRoute } from '../registry';

// Agenda única (SPEC v2, 7.6 e CAL-14): aulas, avaliações e rotina no mesmo formato.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');

export const AgendaItemDto = z.object({
  /** Estável por ocorrência (fonte, id e data original). */
  id: z.string(),
  source: z.enum(['lesson', 'assessment', 'routine', 'event', 'session', 'reminder']),
  sourceId: z.string(),
  kind: z.enum([
    'aula',
    'pratica',
    'prova',
    'atividade',
    'entrega',
    'estudo',
    'revisao',
    'pessoal',
    'compromisso',
    'outro',
  ]),
  title: z.string(),
  disciplineId: z.string().nullable(),
  category: z.string().nullable(),
  color: z.number().int().nullable(),
  /** Dia local. */
  date: day,
  start: z.string(),
  end: z.string(),
  /** HH:MM no fuso do aluno; null em dia inteiro. */
  startLocal: z.string().nullable(),
  endLocal: z.string().nullable(),
  allDay: z.boolean(),
  protected: z.boolean(),
  studyWindow: z.boolean(),
});
export type AgendaItemDto = z.infer<typeof AgendaItemDto>;

export const getAgenda = defineRoute({
  method: 'get',
  path: '/api/v1/agenda',
  summary: 'Ocorrências entre duas datas locais (inclusive), até 62 dias, em ordem.',
  tags: ['agenda'],
  query: z.object({ from: day, to: day }),
  response: z.object({ timezone: z.string(), today: day, items: z.array(AgendaItemDto) }),
  errors: ['invalid_request', 'feature_disabled'],
});
