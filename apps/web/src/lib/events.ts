import 'server-only';
import { schema, type Tx } from '@gutta/db';

// Eventos de produto (ANA-01). Nome no passado, propriedades sem PII.
export type EventName =
  | 'account_created'
  | 'onboarding_completed'
  | 'question_session_started'
  | 'question_answered'
  | 'question_session_finished'
  | 'flashcard_created'
  | 'flashcard_reviewed'
  | 'module_opened'
  | 'recommendation_shown'
  | 'data_export_requested'
  | 'account_deletion_requested';

export async function track(
  tx: Tx,
  actorId: string | null,
  name: EventName,
  properties: Record<string, unknown> = {},
) {
  await tx.insert(schema.productEvents).values({ actorId, eventName: name, properties });
}

export async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entity: { type: string; id?: string | null },
  metadata: Record<string, unknown> = {},
) {
  await tx.insert(schema.auditLogs).values({
    actorId,
    action,
    entityType: entity.type,
    entityId: entity.id ?? null,
    metadata,
  });
}
