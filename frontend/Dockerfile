FROM caddy:2.10.2 AS caddy-bin

FROM alpine:3.22 AS certs
RUN apk add --no-cache ca-certificates

FROM scratch

COPY --from=caddy-bin /usr/bin/caddy /usr/bin/caddy
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv

EXPOSE 80

ENTRYPOINT ["/usr/bin/caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
