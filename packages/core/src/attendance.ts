// Faltas (SPEC v2, 5.12). Tudo em horas-aula. O limite vem da frequência mínima que o aluno
// configurou (FAL-04); nada é presumido para o curso.

const round1 = (n: number) => Math.round(n * 10) / 10;

export type AttendanceStatus = 'dentro' | 'atencao' | 'no_limite' | 'acima';

export type AttendanceSummary = {
  /** Horas-aula de falta permitidas. */
  limit: number;
  registered: number;
  /** Quanto ainda cabe (zero quando passou). */
  remaining: number;
  /** Percentual do limite já usado, 0 a 100 (pode passar de 100). */
  usedPct: number;
  status: AttendanceStatus;
  /** Limiares de aviso já alcançados (FAL-07). */
  reachedThresholds: number[];
};

/**
 * Indicadores (FAL-03). Exemplo do documento: 80 horas-aula, frequência mínima de 75% → limite
 * de 20; com 4 registradas, saldo de 16 e 20% do limite usado.
 */
export function attendanceSummary(input: {
  totalClassHours: number;
  minAttendancePct: number;
  absences: number[];
  thresholds?: number[];
}): AttendanceSummary {
  const limit = round1(input.totalClassHours * (1 - input.minAttendancePct / 100));
  const registered = round1(input.absences.reduce((a, b) => a + b, 0));
  const usedPct = limit > 0 ? Math.round((registered / limit) * 100) : registered > 0 ? 100 : 0;
  const thresholds = [...(input.thresholds ?? [50, 75, 90])].sort((a, b) => a - b);
  const reachedThresholds = thresholds.filter((t) => usedPct >= t);
  const status: AttendanceStatus =
    registered > limit
      ? 'acima'
      : registered === limit && limit > 0
        ? 'no_limite'
        : reachedThresholds.length
          ? 'atencao'
          : 'dentro';
  return {
    limit,
    registered,
    remaining: round1(Math.max(0, limit - registered)),
    usedPct,
    status,
    reachedThresholds,
  };
}

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  dentro: 'Dentro do limite',
  atencao: 'Perto do limite',
  no_limite: 'No limite',
  acima: 'Acima do limite',
};
