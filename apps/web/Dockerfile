# Imagem da plataforma Cognuss (app.gutta…). Build a partir da RAIZ do repositório:
#   docker build -f apps/web/Dockerfile -t gutta-web .
# O site estático continua no Dockerfile da raiz.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
# CA extra opcional (proxy corporativo): docker build --secret id=ca,src=/caminho/ca.crt …
# Sem o secret, nada muda.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    npm install -g pnpm@10.28.0 --silent
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
COPY packages/jobs/package.json packages/jobs/
COPY packages/storage/package.json packages/storage/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_OUTPUT_STANDALONE=1
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm --filter @gutta/db build:migrate && pnpm --filter @gutta/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
RUN addgroup -S -g 1001 gutta && adduser -S -u 1001 -G gutta gutta
COPY --from=build --chown=gutta:gutta /repo/apps/web/.next/standalone ./
COPY --from=build --chown=gutta:gutta /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=gutta:gutta /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=gutta:gutta /repo/packages/db/migrations ./migrations
COPY --from=build --chown=gutta:gutta /repo/packages/db/dist/migrate.mjs ./migrate.mjs
COPY --chown=gutta:gutta apps/web/docker-entrypoint.sh ./docker-entrypoint.sh
USER gutta
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
