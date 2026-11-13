// Passos do cadastro da v2 (SPEC v2, 5.1). A ordem é esta; cada item do plano que cria um
// passo novo entra aqui (disciplinas no item 40, rotina no item 43).
export const SIGNUP_STEPS = [
  { key: 'dados', path: '/comecar/dados', label: 'Dados pessoais' },
  { key: 'perfil', path: '/comecar/perfil', label: 'Perfil acadêmico' },
] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number]['key'];
export type SignupProgress = Record<SignupStep, boolean>;

/** Primeiro passo não concluído, ou null quando acabou. */
export function nextStep(progress: SignupProgress): (typeof SIGNUP_STEPS)[number] | null {
  return SIGNUP_STEPS.find((s) => !progress[s.key]) ?? null;
}

/** Um passo só abre depois dos anteriores (não dá para pular pelo endereço). */
export function canOpen(progress: SignupProgress, step: SignupStep): boolean {
  const i = SIGNUP_STEPS.findIndex((s) => s.key === step);
  return SIGNUP_STEPS.slice(0, i).every((s) => progress[s.key]);
}

export const MAIN_GOALS = [
  { value: 'reforcar_disciplinas', label: 'Reforçar disciplinas' },
  { value: 'preparar_provas', label: 'Preparar-me para provas' },
  { value: 'organizar_rotina', label: 'Organizar minha rotina' },
  { value: 'desenvolver_curriculo', label: 'Desenvolver meu currículo' },
] as const;
