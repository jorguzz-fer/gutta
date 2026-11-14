// Progresso (SPEC v2, 6.4; decisão D13). Da disciplina: aulas concluídas no Acompanhar Aula
// dividido pelas aulas já ocorridas no cronograma. Sem cronograma, sem percentual. Geral: média
// dos progressos das disciplinas, ponderada pelo número de aulas.

export type DisciplineProgressInput = {
  /** Aulas do cronograma (não canceladas). Zero: sem cronograma. */
  lessons: number;
  /** Aulas que já ocorreram. */
  occurred: number;
  /** Aulas já ocorridas que o aluno concluiu no Acompanhar Aula. */
  concluded: number;
};

/** Percentual inteiro de 0 a 100, ou null quando não há o que medir. */
export function disciplineProgress(i: DisciplineProgressInput): number | null {
  if (i.lessons <= 0 || i.occurred <= 0) return null;
  const done = Math.min(Math.max(i.concluded, 0), i.occurred);
  return Math.round((done / i.occurred) * 100);
}

/**
 * Média ponderada pelo número de aulas já ocorridas de cada disciplina, que é o mesmo que somar
 * as concluídas e dividir pelas ocorridas. Disciplinas sem percentual ficam de fora.
 */
export function overallProgress(items: DisciplineProgressInput[]): number | null {
  let occurred = 0;
  let done = 0;
  for (const i of items) {
    if (disciplineProgress(i) === null) continue;
    occurred += i.occurred;
    done += Math.min(Math.max(i.concluded, 0), i.occurred);
  }
  return occurred > 0 ? Math.round((done / occurred) * 100) : null;
}
