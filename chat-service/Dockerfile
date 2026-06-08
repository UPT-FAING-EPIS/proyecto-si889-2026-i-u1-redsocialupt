FROM composer:2 AS composer-bin

FROM php:8.4-cli-alpine3.24

RUN set -eux; \
    apk add --no-cache \
        libzip \
        unzip; \
    apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        libzip-dev; \
    docker-php-ext-install -j"$(nproc)" pdo pdo_mysql zip; \
    apk del .build-deps

COPY --from=composer-bin /usr/bin/composer /usr/local/bin/composer

WORKDIR /app

COPY . .
COPY php.ini /usr/local/etc/php/conf.d/uploads.ini

RUN cp .env.example .env \
    && composer install --no-dev --optimize-autoloader --no-interaction --no-progress \
    && composer clear-cache

RUN mkdir -p public/chat-uploads storage/logs storage/framework/views \
    && chmod -R 775 public/chat-uploads storage

EXPOSE 8000

CMD ["sh", "-lc", "php artisan migrate --force 2>/dev/null; php -S 0.0.0.0:8000 -t public"]
