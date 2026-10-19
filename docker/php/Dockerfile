# Образ PHP для dev-окружения: php-fpm, queue worker и scheduler используют его же.
FROM php:8.4-fpm-alpine

# Стандартный установщик расширений PHP (mlocati/docker-php-extension-installer).
COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

RUN install-php-extensions pdo_pgsql pgsql redis intl bcmath zip opcache pcntl pcov \
    && apk add --no-cache git unzip

# UID/GID пользователя хоста — чтобы файлы, созданные в контейнере (composer, artisan make:*),
# принадлежали разработчику, а не root. Значения передаёт Makefile.
ARG UID=1000
ARG GID=1000
RUN apk add --no-cache shadow \
    && groupmod -o -g "${GID}" www-data \
    && usermod -o -u "${UID}" -g www-data www-data

COPY php.ini /usr/local/etc/php/conf.d/zz-selen.ini
COPY www.conf /usr/local/etc/php-fpm.d/zz-selen.conf

ENV COMPOSER_HOME=/tmp/composer
WORKDIR /var/www/backend
USER www-data
