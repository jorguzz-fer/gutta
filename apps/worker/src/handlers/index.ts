import type { Handlers } from './types';

// Um handler por tópico de @gutta/jobs. O TypeScript cobra: tópico novo sem handler não compila.
export const handlers: Handlers = {
  'system.ping': {
    run: async (payload, ctx) => {
      ctx.log.info('system.ping', { jobId: ctx.jobId, requestId: payload.requestId });
    },
  },
};
