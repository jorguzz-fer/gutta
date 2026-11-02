# Gutta Project

Plataforma de estudo diário para a graduação em saúde. Nome provisório até a resposta do INPI.

*Gutta cavat lapidem, non vi, sed saepe cadendo.*

## O que tem aqui

| Caminho | O que é | URL |
|---|---|---|
| `public/index.html` | Página de espera | gutta.tudomudou.com.br |
| `public/roadmap/index.html` | Roadmap do MVP (26 semanas, tarefas por pessoa, critérios de saída) | gutta.tudomudou.com.br/roadmap |

Cada página é um HTML único, sem build. Para publicar uma página nova, crie `public/<nome>/index.html` e ela passa a responder em `/<nome>`.

## Deploy

Mesmo padrão do `aula.alumine.com.br`: `nginx:alpine` servindo `public/`.

1. No Coolify, novo recurso a partir deste repositório (branch `main`), build pack **Dockerfile**, porta `80`.
2. Domínio: `gutta.tudomudou.com.br`.
3. DNS: registro `A` (ou `CNAME`) de `gutta` no `tudomudou.com.br` apontando para o VPS.

Para testar local:

```bash
docker build -t gutta . && docker run --rm -p 8080:80 gutta
# http://localhost:8080/roadmap
```

## Time

Dr. Kleber Ferreira (coordenação estratégica) · Hugo Orsini (conteúdo e academia, Uni9) · Rafael Dias (operações) · Fernando Jorge (produto, tecnologia e marca)
