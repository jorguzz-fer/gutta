import type { Creator, ScheduleExtractor } from '@gutta/ai';
import type { ObjectStorage } from '@gutta/storage';
import type { Scanner } from '../files/scanner';
import { createCreation } from './creations';
import { filesProcess } from './files';
import { eraseUserObjects } from './maintenance';
import { extractSchedule } from './schedule';
import type { Handler, Handlers } from './types';

export type HandlerDeps = {
  storage: ObjectStorage | null;
  scanner: Scanner;
  /** Null: sem provedor de IA configurado; a importação falha com aviso para o aluno. */
  scheduleExtractor: ScheduleExtractor | null;
  /** Null: sem provedor; a criação falha com aviso para o aluno. */
  creator: Creator | null;
};

function unavailable<T extends 'files.process'>(): Handler<T> {
  return {
    run: async () => {
      // Sem bucket, o trabalho falha e tenta de novo: quando o armazenamento voltar, segue.
      throw new Error('armazenamento não configurado');
    },
  };
}

// Um handler por tópico de @gutta/jobs. O TypeScript cobra: tópico novo sem handler não compila.
export function createHandlers(deps: HandlerDeps): Handlers {
  return {
    'system.ping': {
      run: async (payload, ctx) => {
        ctx.log.info('system.ping', { jobId: ctx.jobId, requestId: payload.requestId });
      },
    },
    'files.process': deps.storage
      ? filesProcess({ storage: deps.storage, scanner: deps.scanner })
      : unavailable(),
    'ai.extract_schedule': extractSchedule({
      storage: deps.storage,
      extractor: deps.scheduleExtractor,
    }),
    'ai.create': createCreation({ creator: deps.creator }),
    'maintenance.erase_user_objects': eraseUserObjects(deps.storage),
  };
}
