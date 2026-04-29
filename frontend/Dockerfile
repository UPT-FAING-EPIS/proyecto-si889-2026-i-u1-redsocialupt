FROM nginx:alpine
RUN apk update && apk upgrade --no-cache && apk add --no-cache ca-certificates
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
