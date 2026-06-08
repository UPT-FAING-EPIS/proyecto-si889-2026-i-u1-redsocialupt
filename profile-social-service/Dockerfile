FROM composer:2 AS composer-bin

FROM php:8.4-cli-alpine

RUN set -eux; \
    apk add --no-cache \
        freetype \
        libjpeg-turbo \
        libpng \
        libwebp \
        libzip \
        unzip; \
    apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        freetype-dev \
        libjpeg-turbo-dev \
        libpng-dev \
        libwebp-dev \
        libzip-dev; \
    docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp; \
    docker-php-ext-install -j"$(nproc)" pdo pdo_mysql zip gd exif; \
    apk del .build-deps

COPY --from=composer-bin /usr/bin/composer /usr/local/bin/composer

WORKDIR /app

COPY . .

RUN cp .env.example .env \
    && composer install --no-dev --optimize-autoloader --no-interaction --no-progress \
    && composer clear-cache

RUN mkdir -p storage/logs storage/framework/views \
    && chmod -R 775 storage

EXPOSE 8000

CMD ["sh", "-lc", "php artisan migrate --force 2>/dev/null; php -S 0.0.0.0:8000 -t public"]
