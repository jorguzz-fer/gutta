// Chaves de funcionalidade da v2 (blueprint §12; SPEC v2, 7.2): cada módulo novo entra
// desligado e o admin liga quando estiver pronto. Os nomes seguem a seção 4.1 da SPEC v2.
export const FEATURES = [
  {
    key: 'cadastro',
    label: 'Cadastro inicial (CAD)',
    text: 'Dados pessoais, perfil acadêmico e objetivo.',
  },
  {
    key: 'disciplinas',
    label: 'Minhas disciplinas e cronogramas (DIS)',
    text: 'Disciplinas do aluno, cronograma e plano de ensino.',
  },
  {
    key: 'rotina',
    label: 'Rotina semanal (ROT)',
    text: 'Grade da semana, horários protegidos e meta de estudo.',
  },
  {
    key: 'equilibrio',
    label: 'Equilíbrio (EQU)',
    text: 'Propostas de plano de estudo e replanejamento.',
  },
  { key: 'meu_espaco', label: 'Meu Espaço (ESP)', text: 'Painel inicial da v2.' },
  {
    key: 'agenda',
    label: 'Agenda e calendário (CAL)',
    text: 'Agenda geral e calendário de cada disciplina.',
  },
  {
    key: 'materiais',
    label: 'Material de estudo (MAT)',
    text: 'Envio de arquivos, biblioteca e busca.',
  },
  { key: 'aula', label: 'Acompanhar aula (AUL)', text: 'Slides com marcações, caderno e selos.' },
  {
    key: 'lembretes',
    label: 'Alertas e lembretes (LEM)',
    text: 'Alertas acadêmicos, meus lembretes e notificações.',
  },
  { key: 'faltas', label: 'Faltas (FAL)', text: 'Controle pessoal de frequência.' },
  {
    key: 'notas',
    label: 'Notas e calculadora (NOT)',
    text: 'Avaliações, médias e "quanto preciso tirar".',
  },
  {
    key: 'ajuda',
    label: 'Ajuda Cognuss (AJU)',
    text: 'Criar com IA, tutor sobre os materiais e minhas criações.',
  },
  {
    key: 'audio',
    label: 'Áudio inteligente (AUD)',
    text: 'Só depois do parecer jurídico (SPEC v2, D10).',
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];
export type Flags = Record<FeatureKey, boolean>;

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];

export function isFeatureKey(k: string): k is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(k);
}

/**
 * Junta o que está gravado com a variável FEATURES_ON (lista separada por vírgula, ou "all"),
 * que liga módulos no ambiente de desenvolvimento e no E2E sem passar pelo admin.
 * Gravado vale o que estiver gravado; o resto começa desligado.
 */
export function resolveFlags(stored: unknown, forcedOn = ''): Flags {
  const saved = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const forced = forcedOn
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const all = forced.includes('all');
  const out = {} as Flags;
  for (const key of FEATURE_KEYS) {
    out[key] = all || forced.includes(key) || saved[key] === true;
  }
  return out;
}
