# Imagem do worker (ADR 0013). Build a partir da RAIZ do repositório:
#   docker build -f apps/worker/Dockerfile -t gutta-worker .
# Mesmo código do app, outro processo. Ferramentas de arquivo (ClamAV, LibreOffice) entram
# aqui quando a fila de arquivos existir (ADR 0012).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    npm install -g pnpm@10.28.0 --silent
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
COPY packages/jobs/package.json packages/jobs/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter @gutta/worker...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm --filter @gutta/worker build

FROM node:22-alpine AS runner
ENV NODE_ENV=production WORKER_HEALTH_PORT=3001
WORKDIR /app
RUN addgroup -S -g 1001 gutta && adduser -S -u 1001 -G gutta gutta
COPY --from=build --chown=gutta:gutta /repo/apps/worker/dist/worker.mjs ./worker.mjs
USER gutta
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health >/dev/null || exit 1
CMD ["node", "worker.mjs"]
