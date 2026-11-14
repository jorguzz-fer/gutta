import 'server-only';
import { storageFromEnv, type ObjectStorage } from '@gutta/storage';
import { ApiError } from './api';

// Armazenamento de arquivos (ADR 0012). Sem as variáveis STORAGE_*, o envio de arquivos fica
// indisponível e o resto da plataforma segue normal.
const g = globalThis as unknown as { __guttaStorage?: ObjectStorage | null };

export function storage(): ObjectStorage | null {
  if (g.__guttaStorage === undefined) g.__guttaStorage = storageFromEnv(process.env);
  return g.__guttaStorage;
}

export function requireStorage(): ObjectStorage {
  const s = storage();
  if (!s) {
    throw new ApiError(503, 'unavailable', 'O envio de arquivos ainda não está disponível.');
  }
  return s;
}

/** Só para testes: troca o armazenamento do processo. */
export function setStorageForTests(s: ObjectStorage | null) {
  g.__guttaStorage = s;
}
