import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, isFeatureKey, resolveFlags } from './catalog';

describe('chaves de funcionalidade', () => {
  it('tudo começa desligado', () => {
    const f = resolveFlags(undefined);
    expect(FEATURE_KEYS.every((k) => f[k] === false)).toBe(true);
  });

  it('respeita o gravado e ignora o que não é booleano verdadeiro', () => {
    const f = resolveFlags({ notas: true, faltas: 'sim', fantasma: true });
    expect(f.notas).toBe(true);
    expect(f.faltas).toBe(false);
    expect('fantasma' in f).toBe(false);
  });

  it('FEATURES_ON liga por lista ou "all"', () => {
    expect(resolveFlags({}, ' notas, agenda ').agenda).toBe(true);
    expect(resolveFlags({}, 'all').audio).toBe(true);
  });

  it('reconhece só chaves do catálogo', () => {
    expect(isFeatureKey('notas')).toBe(true);
    expect(isFeatureKey('constructor')).toBe(false);
  });
});
