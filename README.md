# PlayMarket (Legacy UI Clone)

Android project that recreates the old Google Play Market look and behavior (legacy era style) using Jetpack Compose, with app data served by a Bun API.

## Stack

- Android: Kotlin, Jetpack Compose, Material 3, Coil
- Build: Gradle (KTS), AGP 8+, Java 11+
- Backend API: Bun + TypeScript

## Project Structure

- Android app: `D:\Projects\Android\projects\PlayMarket`
- API server: `D:\Projects\play.google.com\api`
- Data source (API): `D:\Projects\play.google.com\api\src\data\apps.generated.ts`

## Features Implemented

- Legacy Play Market home/categories/top tabs style
- Category screen and category-specific app list
- App details page with:
  - full-screen screenshots
  - install flow with legacy-like states (`WAITING` dashed line -> `DOWNLOADING` progress)
  - cancel action during install
- Search mode with back icon
- API-based pagination and lazy loading
- Russian text handling fixes

## Prerequisites

- JDK 11+ (recommended: JDK 17)
- Android Studio (latest stable)
- Bun installed (`bun --version`)
- Android emulator/device

## 1) Run API (Bun)

Open a terminal:

```powershell
cd D:\Projects\play.google.com\api
bun dev
```

Default API address:

- `http://0.0.0.0:8787`
- Health check: `GET /health`

Main endpoints:

- `GET /apps?mode=all|apps|games&offset=0&limit=120&q=...`
- `GET /apps/:id`

## 2) Configure Android App

In `D:\Projects\Android\projects\PlayMarket\.env` set:

```env
PLAY_API_BASE_URL=http://10.0.2.2:8787
```

Use:

- `10.0.2.2` for Android Emulator (host machine loopback)
- your LAN/public host for physical devices (example: `http://185.128.200.106:8787`)

## 3) Run Android App

```powershell
cd D:\Projects\Android\projects\PlayMarket
.\gradlew.bat :app:assembleDebug
```

Then install from Android Studio or with `adb install`.

## APK Output Name

After `assembleDebug`, APK is renamed to:

- `app/build/outputs/apk/debug/com.android.playmarket.apk`

## Notes

- If API is unreachable, app will show an API loading error.
- If `bun dev` reports `EADDRINUSE`, change `PORT` env var or stop the process using that port.
- Data is parsed from `apps.generated.ts` and cached in API memory for faster responses.
