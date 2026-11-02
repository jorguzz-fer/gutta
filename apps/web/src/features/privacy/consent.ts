import 'server-only';
import { schema, type Tx } from '@gutta/db';

// Versão dos termos e da política. Rascunho até a revisão jurídica (SPEC §13.1, D09).
export const POLICY_VERSION = '2026-11-rascunho';

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
}
