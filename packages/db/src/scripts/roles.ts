import pg from 'pg';

// Cria (ou atualiza) os papéis e o banco. Precisa de um superusuário do Postgres.
// Mesma lógica de infra/postgres/init/01-roles.sh, usada no ambiente local e na CI.
export async function ensureRolesAndDatabase(opts: {
  superuserUrl: string;
  dbName: string;
  ownerPassword: string;
  appPassword: string;
}) {
  const client = new pg.Client({ connectionString: opts.superuserUrl });
  await client.connect();
  const lit = (s: string) => client.escapeLiteral(s);
  const id = (s: string) => client.escapeIdentifier(s);
  try {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gutta_owner') THEN
          CREATE ROLE gutta_owner LOGIN BYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gutta_app') THEN
          CREATE ROLE gutta_app LOGIN NOBYPASSRLS;
        END IF;
      END $$;`);
    await client.query(
      `ALTER ROLE gutta_owner WITH LOGIN BYPASSRLS PASSWORD ${lit(opts.ownerPassword)}`,
    );
    await client.query(
      `ALTER ROLE gutta_app WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${lit(opts.appPassword)}`,
    );
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      opts.dbName,
    ]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${id(opts.dbName)} OWNER gutta_owner`);
    }
  } finally {
    await client.end();
  }
  // O schema public pertence ao dono para que as migrations criem objetos nele.
  const dbUrl = new URL(opts.superuserUrl);
  dbUrl.pathname = `/${opts.dbName}`;
  const c2 = new pg.Client({ connectionString: dbUrl.toString() });
  await c2.connect();
  try {
    await c2.query('ALTER SCHEMA public OWNER TO gutta_owner');
    await c2.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    // pgvector (ADR 0014) só pode ser criado por superusuário; a migration 0051 só confere.
    await c2.query('CREATE EXTENSION IF NOT EXISTS vector');
    await c2.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
  } catch (err) {
    // pg_stat_statements depende de shared_preload_libraries; sem ele seguimos.
    if (!String(err).includes('pg_stat_statements')) throw err;
  } finally {
    await c2.end();
  }
}

export function dbNameOf(url: string) {
  return new URL(url).pathname.replace(/^\//, '');
}
export function passwordOf(url: string) {
  return decodeURIComponent(new URL(url).password);
}
