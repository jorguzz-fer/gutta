import 'server-only';
import { and, desc, eq, schema, type Tx } from '@gutta/db';
import { emit } from '@gutta/jobs';

/*
  Versão dos termos e da política. Rascunho até a revisão jurídica (SPEC §13.1, D09).
  Ao mudar, quem aceitou a versão anterior vê o aviso de nova versão no app e aceita de novo.
*/
export const POLICY_VERSION = '2026-11-14-rascunho';
export { AI_MATERIALS_VECTORS_SINCE, coversVectors } from '@gutta/db';

export type ConsentPurpose = (typeof schema.consentPurpose.enumValues)[number];

export async function recordConsents(
  tx: Tx,
  userId: string,
  choices: Partial<Record<ConsentPurpose, boolean>>,
) {
  const rows = Object.entries(choices)
    .filter(([, granted]) => granted !== undefined)
    .map(([purpose, granted]) => ({
      userId,
      purpose: purpose as ConsentPurpose,
      granted: Boolean(granted),
      policyVersion: POLICY_VERSION,
    }));
  if (rows.length) await tx.insert(schema.consentRecords).values(rows);
  // Autorizar a leitura dos materiais gera os vetores da busca por conceito; retirar apaga.
  if (choices.ai_materials !== undefined) {
    if (!choices.ai_materials)
      await tx.delete(schema.materialChunks).where(eq(schema.materialChunks.ownerId, userId));
    await emit(tx, 'ai.embed_user', { userId });
  }
}

/** Último registro da finalidade (o mais recente vence). */
export async function latestConsent(tx: Tx, userId: string, purpose: ConsentPurpose) {
  const [row] = await tx
    .select({
      granted: schema.consentRecords.granted,
      version: schema.consentRecords.policyVersion,
      at: schema.consentRecords.recordedAt,
    })
    .from(schema.consentRecords)
    .where(
      and(eq(schema.consentRecords.userId, userId), eq(schema.consentRecords.purpose, purpose)),
    )
    .orderBy(desc(schema.consentRecords.recordedAt))
    .limit(1);
  return row ?? null;
}
