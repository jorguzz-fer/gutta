import { describe, expect, it } from 'vitest';
import { formatCpf, isValidCpf, maskCpf, normalizePhone } from './br';

describe('CPF', () => {
  it('aceita CPF válido com ou sem pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });
  it('recusa dígito verificador errado, tamanho errado e sequência repetida', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });
  it('formata e mascara', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCpf('25')).toBe('***.***.***-25');
  });
});

describe('telefone', () => {
  it('normaliza celular e fixo brasileiros', () => {
    expect(normalizePhone('(11) 98765-4321')).toBe('+5511987654321');
    expect(normalizePhone('+55 11 98765-4321')).toBe('+5511987654321');
    expect(normalizePhone('5511987654321')).toBe('+5511987654321');
    expect(normalizePhone('011 3456-7890')).toBe('+551134567890');
  });
  it('aceita número estrangeiro com DDI', () => {
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678');
  });
  it('recusa o que não fecha', () => {
    expect(normalizePhone('98765-4321')).toBeNull();
    expect(normalizePhone('(11) 8765-432')).toBeNull();
    expect(normalizePhone('(00) 98765-4321')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});
