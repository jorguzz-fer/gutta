import { describe, expect, it } from 'vitest';
import { isTopic, jobIdFor, parsePayload, queueOf } from '../src/topics';

describe('tópicos', () => {
  it('deriva a fila do prefixo do tópico', () => {
    expect(queueOf('system.ping')).toBe('system');
    expect(queueOf('files.scan')).toBe('files');
    expect(() => queueOf('desconhecida.algo')).toThrow(/sem fila/);
  });

  it('reconhece só tópicos do catálogo', () => {
    expect(isTopic('system.ping')).toBe(true);
    expect(isTopic('system.nada')).toBe(false);
    expect(isTopic('toString')).toBe(false);
  });

  it('valida o payload', () => {
    expect(parsePayload('system.ping', { requestId: 'r1' })).toEqual({ requestId: 'r1' });
    expect(() => parsePayload('system.ping', { requestId: '' })).toThrow();
  });

  it('gera id de trabalho estável e sem ":"', () => {
    expect(jobIdFor({ id: 7, dedupeKey: null })).toBe('outbox-7');
    expect(jobIdFor({ id: 7, dedupeKey: 'file:abc:scan' })).toBe('file_abc_scan');
    expect(jobIdFor({ id: 8, dedupeKey: 'file:abc:scan' })).toBe('file_abc_scan');
  });
});
