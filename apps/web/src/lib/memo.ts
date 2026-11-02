import 'server-only';

// Cache em memória por processo, com validade curta, para dados iguais para todos os alunos
// (catálogo publicado). Nunca usar para dado pessoal. Publicar algo aparece em até `ttlMs`.
type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();
const MAX_KEYS = 500;

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((err) => {
    store.delete(key);
    throw err;
  });
  if (store.size >= MAX_KEYS) store.delete(store.keys().next().value!);
  store.set(key, { at: Date.now(), value });
  return value;
}
