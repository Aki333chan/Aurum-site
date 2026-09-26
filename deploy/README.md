# Развёртывание Aurum Site

Сайт живёт отдельно от Aurum Panel: `/opt/aurum-site`, системный пользователь `aurumsite`, своя PostgreSQL `aurum_site`, API на локальном `127.0.0.1:3007`. Nginx отдаёт React и проксирует `/api/`; административная панель и её БД не меняются.

Состояние на 26.09.2026: сайт доступен по HTTPS на `aurumgg.ovh` (www перенаправляет на основной домен). Сертификат и пробное продление проверены; hook `certbot-reload-nginx.sh` применяет обновлённый сертификат. Аккаунт `BogOtec` создан с подтверждённой почтой; временный пароль не хранится в репозитории. SMTP ещё не подключён, поэтому регистрация и письма отключены. Привязка Minecraft и каталог гильдий пока не подключены к игровым данным.

1. Создать пользователя и пустую PostgreSQL с правом только на свою БД. Локальное подключение через Unix socket и peer-аутентификацию не требует пароля БД в конфиге.
2. Клонировать репозиторий, выполнить `corepack pnpm install --frozen-lockfile`, затем `corepack pnpm --filter @aurum-site/web build` и `corepack pnpm --filter @aurum-site/api test` под `aurumsite`.
3. Создать `/etc/aurum-site` (root:aurumsite, `0750`) и однократно запустить `node deploy/init-env.js` от root. Скрипт создаёт `api.env` только если файла ещё нет; секрет генерируется локально и не выводится. Дать файлу владельца root:aurumsite и создать симлинк `apps/api/.env` на него.
4. Запустить миграцию `corepack pnpm --filter @aurum-site/api db:migrate` под `aurumsite`, затем однократно `BOOTSTRAP_EMAIL=... BOOTSTRAP_NICKNAME=... corepack pnpm --filter @aurum-site/api bootstrap:owner`. Она работает только на пустой БД при закрытой регистрации и отключённой почте, создаёт подтверждённый аккаунт и печатает временный пароль один раз. Сменить его после первого входа в настройках.
5. Установить `deploy/aurum-site-api.service`; API слушает только loopback. Установить `deploy/nginx-staging.conf` до DNS/сертификата, затем получить Let's Encrypt для `aurumgg.ovh` и `www.aurumgg.ovh` и заменить конфиг на `deploy/nginx-production.conf`. Установить `deploy/certbot-reload-nginx.sh` в `/etc/letsencrypt/renewal-hooks/deploy/` с правами `0755`.
6. До SMTP `EMAIL_ENABLED=false`, `REGISTRATION_ENABLED=false`. Это серверный запрет: регистрация и запросы писем недоступны, даже если кто-то обратится к API напрямую. Вход и смена пароля у заранее подтверждённого аккаунта работают.
7. После подключения почты добавить `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` в `api.env`, поставить `EMAIL_ENABLED=true`, перезапустить API, проверить доставку письма в тестовый ящик. Лишь затем установить `REGISTRATION_ENABLED=true` и повторно перезапустить API. Проверить регистрацию, подтверждение, сброс пароля и SPF/DKIM/DMARC.

Ник сайта: 3–20 латинских букв, цифр или `_`; уникальность проверяется без учёта регистра. Minecraft-ник позже появится в игровом профиле отдельно.

Для обновления выполнить `git pull --ff-only` и сборку веб-приложения из шага 2. Если изменился API, после тестов перезапустить `aurum-site-api.service`; перед заменой конфигурации Nginx выполнить `nginx -t`. Не запускать повторно `bootstrap:owner` и не перезаписывать `/etc/aurum-site/api.env`.
