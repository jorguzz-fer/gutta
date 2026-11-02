# Postgres com o script de papéis embutido na imagem. Montar ./init como volume não serve
# no Coolify: o compose sobe a partir de outra pasta, e o diretório chegaria vazio.
FROM postgres:16-alpine
COPY init/ /docker-entrypoint-initdb.d/
