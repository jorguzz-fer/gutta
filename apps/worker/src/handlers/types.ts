import type { Db } from '@gutta/db';
import type { Payload, Topic } from '@gutta/jobs';
import type { Logger } from '../logger';

export type JobContext = {
  db: Db;
  log: Logger;
  jobId: string;
  /** Tentativa atual, começando em 1. */
  attempt: number;
};

export type Handler<T extends Topic> = {
  run: (payload: Payload<T>, ctx: JobContext) => Promise<void>;
  /**
   * Chamado quando as tentativas acabam (fila de mortos). É aqui que a entidade ligada ao
   * trabalho vira "falhou", com motivo legível para o aluno.
   */
  onDead?: (payload: Payload<T>, ctx: JobContext, error: string) => Promise<void>;
};

export type Handlers = { [T in Topic]: Handler<T> };
