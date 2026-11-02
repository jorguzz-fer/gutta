#!/bin/sh
set -e
# Migrations primeiro (como dono do schema); o servidor só sobe se elas passarem.
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  node ./migrate.mjs
fi
exec node apps/web/server.js
