# Postgres com o script de papéis embutido na imagem. Montar ./init como volume não serve
# no Coolify: o compose sobe a partir de outra pasta, e o diretório chegaria vazio.
#
# pgvector (ADR 0014) é compilado aqui, sobre a mesma base Alpine. Trocar para uma imagem
# Debian mudaria a biblioteca C e, com ela, a ordenação de texto dos índices já em produção.
FROM postgres:16-alpine
ARG PGVECTOR_VERSION=v0.8.7
# O secret "ca" é opcional: só serve para builds atrás de proxy com certificado próprio.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then \
      cp /etc/ssl/certs/ca-certificates.crt /tmp/ca-orig.crt; \
      cat /run/secrets/ca >> /etc/ssl/certs/ca-certificates.crt; \
    fi; \
    apk add --no-cache --virtual .build-pgvector git build-base \
    && git clone --quiet --depth 1 --branch "$PGVECTOR_VERSION" https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make with_llvm=no OPTFLAGS="" \
    && make with_llvm=no install \
    && cd / && rm -rf /tmp/pgvector \
    && apk del .build-pgvector \
    && if [ -f /tmp/ca-orig.crt ]; then mv /tmp/ca-orig.crt /etc/ssl/certs/ca-certificates.crt; fi
COPY init/ /docker-entrypoint-initdb.d/
