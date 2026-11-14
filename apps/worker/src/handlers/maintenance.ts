import { keys, type ObjectStorage } from '@gutta/storage';
import type { Handler } from './types';

/** Conta excluída (LGPD): apaga do bucket tudo o que estava sob o prefixo do aluno. */
export function eraseUserObjects(
  storage: ObjectStorage | null,
): Handler<'maintenance.erase_user_objects'> {
  return {
    run: async ({ userId }, ctx) => {
      if (!storage) {
        // Sem bucket configurado não há o que apagar; o evento fica registrado no log.
        ctx.log.warn('storage.erase_skipped', { reason: 'sem armazenamento configurado' });
        return;
      }
      const removed = await storage.deletePrefix(keys.userPrefix(userId));
      ctx.log.info('storage.user_erased', { objects: removed });
    },
  };
}
