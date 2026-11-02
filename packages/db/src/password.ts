import { hash, verify } from '@node-rs/argon2';

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, 2 iterações).
// Usado pelo Better Auth (ADR 0002) e pelos seeds, para que os dois gerem o mesmo formato.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(input.hash, input.password);
  } catch {
    return false;
  }
}
