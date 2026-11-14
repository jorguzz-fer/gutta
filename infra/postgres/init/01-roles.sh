#!/bin/sh
# Roda uma vez, quando o volume do Postgres é criado (docker-entrypoint-initdb.d).
# Cria o dono do schema (migrations) e o papel da aplicação, sem BYPASSRLS (ADR 0003).
set -eu
: "${GUTTA_DB:=gutta}"
: "${GUTTA_OWNER_PASSWORD:?defina GUTTA_OWNER_PASSWORD}"
: "${GUTTA_APP_PASSWORD:?defina GUTTA_APP_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$GUTTA_OWNER_PASSWORD" -v app_pw="$GUTTA_APP_PASSWORD" -v db="$GUTTA_DB" <<'SQL'
CREATE ROLE gutta_owner LOGIN BYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE gutta_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_pw';
CREATE DATABASE :"db" OWNER gutta_owner;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$GUTTA_DB" <<'SQL'
ALTER SCHEMA public OWNER TO gutta_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL
