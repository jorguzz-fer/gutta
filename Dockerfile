# Imagem estática para gutta.tudomudou.com.br
# Mesmo padrão do aula.alumine.com.br: nginx:alpine servindo a pasta public/.
FROM nginx:alpine
COPY public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
