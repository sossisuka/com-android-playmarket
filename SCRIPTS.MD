# Scripts Documentation

Документация по скриптам в `api/scripts` и npm/bun-командам из `api/package.json`.

## Быстрый старт

Из корня проекта:

```powershell
cd api
bun install
```

Запуск UI:

```powershell
bun run sync:ui
```

UI поднимется на `http://127.0.0.1:8787` (по умолчанию).

## Команды package.json (`api`)

- `bun run dev` — запуск API в watch-режиме (`src/server.ts`).
- `bun run start` — запуск API без watch.
- `bun run sync:ui` — запуск web UI для управления sync-скриптами.
- `bun run sync:archive-apps` — запуск импорта приложений из web.archive.org.
- `bun run download:archive-icons` — загрузка архивных иконок.

## Скрипты `api/scripts`

### 1) `sync-google-play-ui.mjs`

Назначение: единый web-интерфейс для запуска и мониторинга задач.

Поддерживаемые задачи из UI:

- Полный sync Google Play (`runSync`).
- Sync по списку package IDs (`runSyncPackages`).
- Импорт из web archive (`sync-archive-apps.mjs`).
- Очистка/нормализация данных (`clean-app-data.mjs`).
- Полное удаление сгенерированных app-данных (`clear-app-data.mjs`).

Особенности:

- Одна задача одновременно (глобальный lock).
- Реалтайм события через SSE (`/events`).
- Потоковый лог stdout/stderr для дочерних скриптов.
- Запуск внешних скриптов через `bun`.

Переменные окружения:

- `PLAY_UI_HOST` (default: `127.0.0.1`)
- `PLAY_UI_PORT` (default: `8787`)

### 2) `sync-google-play.mjs`

Назначение: синхронизация приложений из Google Play в:

- `api/src/data/apps.generated.ts`
- `api/src/data/playCategories.generated.ts`

Режимы:

- `runSync()` — массовый сбор по feed/search.
- `runSyncPackages(packageIds)` — точечный sync по пакетам.

Запуск напрямую:

```powershell
cd api
bun scripts/sync-google-play.mjs
```

Если задан `PLAY_PACKAGE_IDS`, скрипт автоматически идет в режим `runSyncPackages`.

Ключевые env-параметры:

- Локаль: `PLAY_COUNTRY`, `PLAY_LANG`, `PLAY_EN_LANG`, `PLAY_RU_LANG`
- Ретраи/таймауты: `PLAY_RETRY_COUNT`, `PLAY_RETRY_BASE_DELAY_MS`, `PLAY_REQUEST_TIMEOUT_MS`
- Производительность: `PLAY_FEED_CONCURRENCY`, `PLAY_SEARCH_CONCURRENCY`, `PLAY_DETAIL_CONCURRENCY`
- Ограничения: `PLAY_BATCH_SIZE`, `PLAY_MAX_NEW_APPS`, `PLAY_SEARCH_TERMS_LIMIT`
- Поведение: `PLAY_SEARCH_ENABLED`, `PLAY_FULL_RESYNC`, `PLAY_PACKAGE_IDS`

### 3) `sync-archive-apps.mjs`

Назначение: импорт приложений из исторических снимков web.archive.org (Google Play pages).

Команда:

```powershell
cd api
bun run sync:archive-apps -- --from-year=2013 --to-year=2016 --limit-apps=100
```

CLI-аргументы:

- `--year=YYYY` — shorthand для `fromYear=toYear`.
- `--from-year=YYYY`
- `--to-year=YYYY`
- `--limit-pages=N` — лимит snapshots на source page.
- `--limit-apps=N` — лимит новых apps на запуск.
- `--packages=id1,id2` — ручной режим импорта конкретных package IDs.
- `--dry-run` — только discovery, без импорта.
- `--skip-icons` — пропустить иконки.
- `--force-icons` — форс-перекачка иконок.
- `--icon-year=YYYY` — фиксированный год для иконок.
- `--icon-chunk-size=N` — размер чанка для icon downloader.
- `--snapshot-concurrency=N` — аккуратная параллельность загрузки snapshot-страниц (новое).

Ключевые env-параметры:

- Годы/лимиты: `PLAY_ARCHIVE_SYNC_FROM_YEAR`, `PLAY_ARCHIVE_SYNC_TO_YEAR`, `PLAY_ARCHIVE_SYNC_PAGE_LIMIT`, `PLAY_ARCHIVE_SYNC_APP_LIMIT`
- Сеть: `PLAY_ARCHIVE_SYNC_TIMEOUT_MS`, `PLAY_ARCHIVE_SYNC_RETRIES`
- Rate limit: `PLAY_ARCHIVE_SYNC_CDX_CALLS_PER_SECOND`, `PLAY_ARCHIVE_SYNC_PAGE_CALLS_PER_SECOND`, `PLAY_ARCHIVE_SYNC_IMAGE_CALLS_PER_SECOND`
- Cooldown: `PLAY_ARCHIVE_SYNC_RATE_LIMIT_DELAY_MS`, `PLAY_ARCHIVE_SYNC_MAX_RATE_LIMIT_DELAY_MS`
- Иконки: `PLAY_ARCHIVE_SYNC_ICON_YEAR`, `PLAY_ARCHIVE_SYNC_ICON_CHUNK_SIZE`
- Concurrency snapshots: `PLAY_ARCHIVE_SYNC_SNAPSHOT_CONCURRENCY`
- UA: `PLAY_ARCHIVE_SYNC_USER_AGENT`

### 4) `download-archive-icons.mjs`

Назначение: поиск и загрузка иконок приложений из archive snapshots.

Команда:

```powershell
cd api
bun run download:archive-icons -- --year=2014 --limit=500
```

CLI-аргументы:

- `--year=YYYY`
- `--timestamp=YYYYMMDDhhmmss` (год timestamp должен совпадать с `--year`)
- `--limit=N`
- `--concurrency=N`
- `--packages=id1,id2`
- `--force`

Ключевые env-параметры:

- `PLAY_ARCHIVE_YEAR`
- `PLAY_ARCHIVE_CONCURRENCY`
- `PLAY_ARCHIVE_RETRIES`
- `PLAY_ARCHIVE_TIMEOUT_MS`
- `PLAY_ARCHIVE_CDX_CALLS_PER_SECOND`
- `PLAY_ARCHIVE_PAGE_CALLS_PER_SECOND`
- `PLAY_ARCHIVE_IMAGE_CALLS_PER_SECOND`
- `PLAY_ARCHIVE_RATE_LIMIT_DELAY_MS`
- `PLAY_ARCHIVE_MAX_RATE_LIMIT_DELAY_MS`
- `PLAY_ARCHIVE_USER_AGENT`

### 5) `clean-app-data.mjs`

Назначение: мягкая очистка/нормализация существующего `apps.generated.ts`.

Что делает:

- Чистит mojibake/мусорные символы.
- Нормализует URL, даты, рейтинги, массивы.
- Дедуплицирует приложения и связи.

Запуск:

```powershell
cd api
bun scripts/clean-app-data.mjs
```

### 6) `clear-app-data.mjs`

Назначение: полный сброс generated app/category данных.

Что делает:

- Перезаписывает `apps.generated.ts` пустым массивом.
- Перезаписывает `playCategories.generated.ts` пустым массивом.

Запуск:

```powershell
cd api
bun scripts/clear-app-data.mjs
```

## Рекомендуемые сценарии

1. Полная ручная работа через UI:
   - `cd api`
   - `bun run sync:ui`
   - открыть UI и запускать нужные задачи.

2. Архивный импорт с ограничением нагрузки:
   - `bun run sync:archive-apps -- --from-year=2013 --to-year=2014 --limit-apps=200 --snapshot-concurrency=3`

3. Точечный sync пакетов:
   - Через UI: режим `Sync по package IDs`.
   - Или через env: `PLAY_PACKAGE_IDS="com.example.app1,com.example.app2" bun scripts/sync-google-play.mjs`
