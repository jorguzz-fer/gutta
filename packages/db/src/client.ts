import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createPool(url: string, max = Number(process.env.DB_POOL_MAX ?? 10)) {
  return new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Toda conexão grava em UTC; a apresentação converte para o fuso do aluno.
    options: '-c timezone=UTC',
  });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

/**
 * Executa `fn` numa transação com o aluno no contexto do RLS (ADR 0003).
 * `set_config(..., true)` vale só para esta transação, então o contexto não vaza para a
 * próxima requisição que pegar a mesma conexão do pool.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error('withUser exige um userId');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** Consulta sem usuário no contexto: o RLS só devolve o que é público (catálogo publicado). */
export async function withAnonymous<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', '', true)`);
    return fn(tx);
  });
}

/**
 * Roda consultas em sequência dentro de uma transação. Uma conexão do Postgres executa uma
 * consulta por vez; Promise.all na mesma transação só enfileira (e é depreciado no pg 9).
 */
export async function inSequence<const T extends readonly (() => unknown)[]>(
  fns: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
