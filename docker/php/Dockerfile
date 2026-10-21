# Образ PHP для dev-окружения: php-fpm, queue worker и scheduler используют его же.
FROM php:8.4-fpm-alpine

# Стандартный установщик расширений PHP (mlocati/docker-php-extension-installer).
COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

# Расширения не из состава PHP — redis и pcov — из исходников на GitHub по тегу, а не с pecl.php.net: он то и дело не
# отвечал, и сборка падала (LATER-82). Архив проверяется по sha256 — другой архив останавливает сборку. liblzf — подмодуль
# phpredis (в архиве тега его нет), нужен для сжатия lzf, как в пакете с PECL. Новая версия — docs/runbook.md, раздел 12.
ARG PHPREDIS_VERSION=6.3.0
ARG PHPREDIS_SHA256=cb8f81df1a275599e4f8ddcfec7e1f65ed1953e6f5673649149fd680ebff4cad
ARG LIBLZF_COMMIT=fb25820c3c0aeafd127956ae6c115063b47e459a
ARG LIBLZF_SHA256=8e425b5bf7a569543e29cb4a16a913445d80c4efe83b371760ca798ca9b819ed
ARG PCOV_VERSION=1.0.12
ARG PCOV_SHA256=fdd07cad8e2ff42f0c9f095d84aeef11dab0fde7a008805f61883cbcb1b3f12b

RUN set -eux; \
    mkdir -p /tmp/ext/redis/liblzf /tmp/ext/pcov; \
    cd /tmp/ext; \
    curl -fsSL --retry 5 -o redis.tar.gz "https://github.com/phpredis/phpredis/archive/refs/tags/${PHPREDIS_VERSION}.tar.gz"; \
    curl -fsSL --retry 5 -o liblzf.tar.gz "https://github.com/nemequ/liblzf/archive/${LIBLZF_COMMIT}.tar.gz"; \
    curl -fsSL --retry 5 -o pcov.tar.gz "https://github.com/krakjoe/pcov/archive/refs/tags/v${PCOV_VERSION}.tar.gz"; \
    printf '%s  %s\n' \
        "$PHPREDIS_SHA256" redis.tar.gz \
        "$LIBLZF_SHA256" liblzf.tar.gz \
        "$PCOV_SHA256" pcov.tar.gz \
        | sha256sum -c -; \
    tar -xzf redis.tar.gz -C redis --strip-components=1; \
    tar -xzf liblzf.tar.gz -C redis/liblzf --strip-components=1; \
    tar -xzf pcov.tar.gz -C pcov --strip-components=1; \
    install-php-extensions pdo_pgsql pgsql intl bcmath zip opcache pcntl /tmp/ext/redis /tmp/ext/pcov; \
    cd /; \
    rm -rf /tmp/ext; \
    apk add --no-cache git unzip

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
