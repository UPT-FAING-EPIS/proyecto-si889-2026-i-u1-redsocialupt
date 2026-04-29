FROM php:8.5.6RC1-cli-alpine3.23

RUN apk update && apk upgrade --no-cache && apk add --no-cache \
    libzip-dev \
    zip \
    unzip \
    curl \
    libpng-dev \
    oniguruma-dev \
    $PHPIZE_DEPS \
    && docker-php-ext-install pdo pdo_mysql zip

RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /app

COPY . .

RUN cp .env.example .env \
    && composer install --no-dev --optimize-autoloader

RUN mkdir -p storage/logs storage/framework/views \
    && chmod -R 775 storage

EXPOSE 8000

CMD php artisan migrate --force 2>/dev/null; php -S 0.0.0.0:8000 -t public
