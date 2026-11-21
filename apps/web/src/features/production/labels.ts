import type { production } from '@gutta/contracts';

// Textos da produção de aulas usados nas telas do admin.

export const BATCH_STATUS: Record<
  production.BatchDto['status'],
  { text: string; tone: 'neutral' | 'accent' | 'warn' | 'success' | 'danger'; busy: boolean }
> = {
  waiting_file: { text: 'Verificando o arquivo', tone: 'neutral', busy: true },
  extracting: { text: 'Separando os slides', tone: 'neutral', busy: true },
  planning: { text: 'Planejando as peças', tone: 'accent', busy: true },
  ready: { text: 'Plano pronto', tone: 'success', busy: false },
  failed: { text: 'Falhou', tone: 'danger', busy: false },
  generating: { text: 'Gerando as peças', tone: 'accent', busy: true },
  generated: { text: 'Peças geradas', tone: 'success', busy: false },
};

export const SLIDE_KIND: Record<production.SlideDto['kind'], string> = {
  content: 'Conteúdo',
  instruction: 'Pedido',
  reference: 'Referência',
};

export function usd(micros: number) {
  return (micros / 1_000_000).toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
}
