import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";

import {
  ALLOWED_MEDIA_HOST_SUFFIXES,
  APK_DIR,
  APPS_FILE,
  APPS_PAGE_SIZE,
  HISTORICAL_HOME_BANNERS,
  HOST,
  ICONS_DIR,
  MEDIA_PROXY_ENABLED,
  MEDIA_PROXY_TIMEOUT_MS,
  PACKAGE_ID_RE,
  PORT,
  REALTIME_CACHE_SYNC_ENABLED,
  REVIEWS_FILE,
  UNSUPPORTED_APPS_DIR,
  UNSUPPORTED_APPS_FILE,
  USERS_DB_FILE,
} from "./server/config.ts";
import type {
  Cache,
  HomeSection,
  RawApp,
  ReviewRecord,
  ReviewsDb,
  SessionRecord,
  SummaryApp,
  UserRecord,
  UsersDb,
} from "./server/types.ts";

let localIconIndexCache: Map<string, string> | null = null;
let localIconIndexPromise: Promise<Map<string, string>> | null = null;
let appsFileWatcherStarted = false;
let appsReloadTimer: ReturnType<typeof setTimeout> | null = null;


let cache: Cache | null = null;
let cacheLoadPromise: Promise<Cache> | null = null;
let usersDbCache: UsersDb | null = null;
let usersDbLoadPromise: Promise<UsersDb> | null = null;
let reviewsDbCache: ReviewsDb | null = null;
let reviewsDbLoadPromise: Promise<ReviewsDb> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function logInfo(message: string): void {
  console.log(`[api][${nowIso()}] ${message}`);
}

function parseExportedJson<T>(fileText: string, marker: string): T {
  const markerPos = fileText.indexOf(marker);
  if (markerPos === -1) throw new Error(`${marker} marker not found`);

  const assignPos = fileText.indexOf("=", markerPos);
  if (assignPos === -1) throw new Error(`${marker} assignment not found`);

  const objectStart = fileText.indexOf("{", assignPos);
  if (objectStart === -1) throw new Error(`${marker} object start not found`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectEnd = -1;

  for (let i = objectStart; i < fileText.length; i++) {
    const ch = fileText[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        objectEnd = i;
        break;
      }
    }
  }

  if (objectEnd === -1) throw new Error(`${marker} object end not found`);

  return JSON.parse(fileText.slice(objectStart, objectEnd + 1)) as T;
}

function serializeUsersDb(db: UsersDb): string {
  return `export const usersDb = ${JSON.stringify(db, null, 2)} as const;\n`;
}

async function ensureUsersDbFile(): Promise<void> {
  try {
    await stat(USERS_DB_FILE);
  } catch {
    await mkdir(path.dirname(USERS_DB_FILE), { recursive: true });
    await writeFile(
      USERS_DB_FILE,
      serializeUsersDb({ users: [], sessions: [] }),
      "utf8",
    );
  }
}

async function ensureUsersDb(): Promise<UsersDb> {
  if (usersDbCache) return usersDbCache;
  if (usersDbLoadPromise) return usersDbLoadPromise;

  usersDbLoadPromise = (async () => {
    await ensureUsersDbFile();
    const fileText = await readFile(USERS_DB_FILE, "utf8");
    const db = parseExportedJson<UsersDb>(fileText, "export const usersDb");
    usersDbCache = {
      users: Array.isArray(db.users)
        ? db.users.map((item) => ({
            ...item,
            favoriteAppIds: Array.isArray(item.favoriteAppIds)
              ? item.favoriteAppIds
              : [],
            libraryAppIds: Array.isArray(
              (item as Partial<UserRecord>).libraryAppIds,
            )
              ? ((item as Partial<UserRecord>).libraryAppIds as string[])
              : [],
          }))
        : [],
      sessions: Array.isArray(db.sessions) ? db.sessions : [],
    };
    return usersDbCache;
  })();

  try {
    return await usersDbLoadPromise;
  } finally {
    usersDbLoadPromise = null;
  }
}

async function saveUsersDb(db: UsersDb): Promise<void> {
  usersDbCache = db;
  await mkdir(path.dirname(USERS_DB_FILE), { recursive: true });
  await writeFile(USERS_DB_FILE, serializeUsersDb(db), "utf8");
}

function normalizeReviewRating(value: unknown): number {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 0;
  return rating;
}

function normalizeReviewRecord(value: unknown): ReviewRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const packageId = String(raw.packageId ?? "").trim();
  const userId = String(raw.userId ?? "").trim();
  const authorName = fixMojibake(String(raw.authorName ?? "").trim());
  const title = fixMojibake(String(raw.title ?? "").trim());
  const text = fixMojibake(String(raw.text ?? "").trim());
  const rating = normalizeReviewRating(raw.rating);
  if (!PACKAGE_ID_RE.test(packageId) || !userId || !authorName || !text) {
    return null;
  }
  return {
    id: String(raw.id ?? "").trim() || randomBytes(8).toString("hex"),
    packageId,
    userId,
    authorName,
    title,
    text,
    rating,
    createdAt: String(raw.createdAt ?? nowIso()),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? nowIso()),
    appVersion: String(raw.appVersion ?? "").trim(),
    deviceLabel: String(raw.deviceLabel ?? "").trim(),
  };
}

function normalizeReviewsDb(value: unknown): ReviewsDb {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { reviews: [] };
  }
  const raw = value as { reviews?: unknown };
  return {
    reviews: Array.isArray(raw.reviews)
      ? raw.reviews
          .map(normalizeReviewRecord)
          .filter((item): item is ReviewRecord => Boolean(item))
      : [],
  };
}

async function ensureReviewsDbFile(): Promise<void> {
  try {
    await stat(REVIEWS_FILE);
  } catch {
    await mkdir(path.dirname(REVIEWS_FILE), { recursive: true });
    await writeFile(
      REVIEWS_FILE,
      `${JSON.stringify({ reviews: [] }, null, 2)}\n`,
      "utf8",
    );
  }
}

async function ensureReviewsDb(): Promise<ReviewsDb> {
  if (reviewsDbCache) return reviewsDbCache;
  if (reviewsDbLoadPromise) return reviewsDbLoadPromise;

  reviewsDbLoadPromise = (async () => {
    await ensureReviewsDbFile();
    const fileText = await readFile(REVIEWS_FILE, "utf8");
    reviewsDbCache = normalizeReviewsDb(JSON.parse(fileText));
    return reviewsDbCache;
  })();

  try {
    return await reviewsDbLoadPromise;
  } finally {
    reviewsDbLoadPromise = null;
  }
}

async function saveReviewsDb(db: ReviewsDb): Promise<void> {
  reviewsDbCache = db;
  await mkdir(path.dirname(REVIEWS_FILE), { recursive: true });
  await writeFile(
    REVIEWS_FILE,
    `${JSON.stringify(normalizeReviewsDb(db), null, 2)}\n`,
    "utf8",
  );
}

function reviewsForPackage(db: ReviewsDb, packageId: string): ReviewRecord[] {
  return db.reviews
    .filter((item) => item.packageId === packageId)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt || "") -
          Date.parse(a.updatedAt || a.createdAt || "") ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

function buildReviewSummary(reviews: ReviewRecord[]) {
  const counts = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
  ]);
  let total = 0;
  let sum = 0;

  for (const review of reviews) {
    const rating = normalizeReviewRating(review.rating);
    counts.set(rating, (counts.get(rating) ?? 0) + 1);
    total += 1;
    sum += rating;
  }

  const averageRating = total > 0 ? Number((sum / total).toFixed(1)) : 0;
  const ratingCountText =
    total <= 0 ? "0 reviews" : total === 1 ? "1 review" : `${total} reviews`;

  return {
    totalReviews: total,
    averageRating,
    ratingCountText,
    histogram: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: counts.get(stars) ?? 0,
    })),
  };
}

function applyReviewSummaryToRawApp(
  app: RawApp,
  summary: ReturnType<typeof buildReviewSummary>,
): RawApp {
  return {
    ...app,
    reviews: summary.totalReviews,
    ratingValue: summary.averageRating,
    ratingCountText: summary.ratingCountText,
  };
}

type UnsupportedAppsDb = Record<string, string[]>;

function normalizeApiLevel(value: unknown): number | null {
  const apiLevel = Number(value);
  if (!Number.isInteger(apiLevel) || apiLevel < 1 || apiLevel > 1000) {
    return null;
  }
  return apiLevel;
}

function unsupportedAppsKey(apiLevel: number): string {
  return `api${apiLevel}`;
}

function normalizeUnsupportedAppsDb(value: unknown): UnsupportedAppsDb {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => /^api\d+$/.test(key))
    .map(([key, packageIds]) => [
      key,
      normalizeUnsupportedPackageIds(packageIds),
    ]);
  return Object.fromEntries(entries);
}

async function readLegacyUnsupportedAppsDb(): Promise<UnsupportedAppsDb> {
  const migrated: UnsupportedAppsDb = {};

  try {
    const entries = await readdir(UNSUPPORTED_APPS_DIR, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^unsupported_apps_api(\d+)\.json$/);
      if (!match) continue;

      const apiLevel = normalizeApiLevel(match[1]);
      if (apiLevel == null) continue;

      const key = unsupportedAppsKey(apiLevel);
      const filePath = path.join(UNSUPPORTED_APPS_DIR, entry.name);
      try {
        const fileText = await readFile(filePath, "utf8");
        const packageIds = normalizeUnsupportedPackageIds(
          JSON.parse(fileText) as unknown,
        );
        migrated[key] = normalizeUnsupportedPackageIds([
          ...(migrated[key] ?? []),
          ...packageIds,
        ]);
      } catch {
        if (!(key in migrated)) {
          migrated[key] = [];
        }
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw error;
  }

  return migrated;
}

async function ensureUnsupportedAppsDbFile(): Promise<string> {
  try {
    await stat(UNSUPPORTED_APPS_FILE);
  } catch {
    await mkdir(path.dirname(UNSUPPORTED_APPS_FILE), { recursive: true });
    const migrated = await readLegacyUnsupportedAppsDb();
    await writeFile(
      UNSUPPORTED_APPS_FILE,
      `${JSON.stringify(migrated, null, 2)}\n`,
      "utf8",
    );
  }
  return UNSUPPORTED_APPS_FILE;
}

function normalizeUnsupportedPackageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => PACKAGE_ID_RE.test(item)),
    ),
  ].sort();
}

async function readUnsupportedAppsDb(): Promise<UnsupportedAppsDb> {
  const filePath = await ensureUnsupportedAppsDbFile();
  const fileText = await readFile(filePath, "utf8");
  try {
    return normalizeUnsupportedAppsDb(JSON.parse(fileText) as unknown);
  } catch {
    return {};
  }
}

async function saveUnsupportedAppsDb(db: UnsupportedAppsDb): Promise<void> {
  const filePath = await ensureUnsupportedAppsDbFile();
  await writeFile(
    filePath,
    `${JSON.stringify(normalizeUnsupportedAppsDb(db), null, 2)}\n`,
    "utf8",
  );
}

async function readUnsupportedApps(apiLevel: number): Promise<string[]> {
  const db = await readUnsupportedAppsDb();
  const key = unsupportedAppsKey(apiLevel);
  if (!(key in db)) {
    db[key] = [];
    await saveUnsupportedAppsDb(db);
  }
  return db[key];
}

async function saveUnsupportedApps(
  apiLevel: number,
  packageIds: string[],
): Promise<void> {
  const db = await readUnsupportedAppsDb();
  db[unsupportedAppsKey(apiLevel)] = normalizeUnsupportedPackageIds(packageIds);
  await saveUnsupportedAppsDb(db);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userPublic(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      "Пользователь",
    country: user.country,
    createdAt: user.createdAt,
    favoriteAppIds: user.favoriteAppIds,
    libraryAppIds: user.libraryAppIds,
  };
}

function createPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const parts = encodedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, storedHex] = parts;
  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHex, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function readAuthToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function requireAuth(
  req: Request,
): Promise<{ db: UsersDb; user: UserRecord; token: string } | null> {
  const token = readAuthToken(req);
  if (!token) return null;
  const db = await ensureUsersDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  return { db, user, token };
}

function fixMojibake(value: string): string {
  if (!value) return value;
  try {
    const bytes = Buffer.from(value, "latin1");
    const converted = bytes.toString("utf8");
    const cyr = (s: string) =>
      [...s].filter((ch) => ch >= "\u0400" && ch <= "\u04FF").length;
    return cyr(converted) > cyr(value) ? converted : value;
  } catch {
    return value;
  }
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

function normalizeDescriptionBlocks(value: unknown): string[] {
  return toStringArray(value)
    .flatMap((paragraph) => fixMojibake(paragraph).split(/\n{2,}/g))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizeTextList(value: unknown): string[] {
  return toStringArray(value)
    .map((line) => fixMojibake(line).trim())
    .filter(Boolean);
}

function normalizeAppDetails(app: RawApp): RawApp {
  return {
    ...app,
    name: fixMojibake(String(app.name ?? "Unknown")),
    publisher: fixMojibake(String(app.publisher ?? "Unknown")),
    subtitle: fixMojibake(String(app.subtitle ?? "")),
    description: normalizeDescriptionBlocks(app.description),
    whatsNew: normalizeTextList(app.whatsNew),
  };
}

function pickSummary(app: RawApp): SummaryApp {
  return {
    id: String(app.id ?? ""),
    name: fixMojibake(String(app.name ?? "Unknown")),
    publisher: fixMojibake(String(app.publisher ?? "Unknown")),
    subtitle: fixMojibake(String(app.subtitle ?? "")),
    category: String(app.category ?? ""),
    price: String(app.price ?? ""),
    installs: String(app.installs ?? ""),
    color: String(app.color ?? ""),
    icon: pickRemoteIconFallback(
      String(app.icon ?? ""),
      String(app.image ?? ""),
    ),
    trailerImage: String(app.trailerImage ?? ""),
    trailerUrl: String(app.trailerUrl ?? ""),
    reviews: Number(app.reviews ?? 0),
    ratingValue: Number(app.ratingValue ?? 0),
    ratingCountText: fixMojibake(String(app.ratingCountText ?? "")),
  };
}

async function getLocalIconIndex(): Promise<Map<string, string>> {
  if (localIconIndexCache) return localIconIndexCache;
  if (localIconIndexPromise) return localIconIndexPromise;

  localIconIndexPromise = (async () => {
    const next = new Map<string, string>();
    try {
      const entries = await readdir(ICONS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (
          ![".avif", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".gif"].includes(
            ext,
          )
        ) {
          continue;
        }
        next.set(path.basename(entry.name, ext), entry.name);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw error;
    }
    localIconIndexCache = next;
    return next;
  })();

  try {
    return await localIconIndexPromise;
  } finally {
    localIconIndexPromise = null;
  }
}

function absoluteUrl(req: Request, pathname: string): string {
  const url = new URL(req.url);
  return new URL(pathname, url.origin).toString();
}

function resolvedIconUrl(
  req: Request,
  iconIndex: Map<string, string>,
  appId: string,
  fallback: string,
): string {
  const localFileName = iconIndex.get(appId);
  if (!localFileName) return fallback;
  return absoluteUrl(req, `/icons/${encodeURIComponent(localFileName)}`);
}

function pickRemoteIconFallback(primary: string, secondary = ""): string {
  const normalizeRemoteUrl = (value: string): string => {
    const raw = value.trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^http:\/\//i.test(raw))
      return `https://${raw.slice("http://".length)}`;
    return raw;
  };

  const first = normalizeRemoteUrl(primary);
  if (/^https?:\/\//i.test(first)) return first;

  const second = normalizeRemoteUrl(secondary);
  if (/^https?:\/\//i.test(second)) return second;

  return first || second;
}

function isAllowedMediaHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  if (host === "web.archive.org") return true;
  return ALLOWED_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function toClientMediaUrl(req: Request, input: string): string {
  const normalized = pickRemoteIconFallback(input);
  if (!normalized) return "";

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return normalized;
  }

  if (!/^https?:$/i.test(parsed.protocol)) return normalized;
  if (!isAllowedMediaHost(parsed.hostname)) return normalized;
  if (!MEDIA_PROXY_ENABLED) return normalized;
  const requestProtocol = new URL(req.url).protocol.toLowerCase();
  if (requestProtocol !== "https:") return normalized;

  return absoluteUrl(
    req,
    `/media?url=${encodeURIComponent(parsed.toString())}`,
  );
}

function withResolvedSummaryIcon(
  req: Request,
  iconIndex: Map<string, string>,
  app: SummaryApp,
): SummaryApp {
  const fallback = toClientMediaUrl(req, pickRemoteIconFallback(app.icon));
  return {
    ...app,
    icon: resolvedIconUrl(req, iconIndex, app.id, fallback),
  };
}

function withResolvedRawIcon(
  req: Request,
  iconIndex: Map<string, string>,
  app: RawApp,
): RawApp {
  const id = String(app.id ?? "").trim();
  if (!id) return app;
  const fallback = toClientMediaUrl(
    req,
    pickRemoteIconFallback(String(app.icon ?? ""), String(app.image ?? "")),
  );
  const resolvedIcon = resolvedIconUrl(req, iconIndex, id, fallback);
  const screenshots = toStringArray(app.screenshots).map((item) =>
    toClientMediaUrl(req, item),
  );

  return {
    ...app,
    icon: resolvedIcon,
    image: toClientMediaUrl(req, String(app.image ?? "")) || resolvedIcon,
    trailerImage: toClientMediaUrl(req, String(app.trailerImage ?? "")),
    screenshots,
  };
}

function withResolvedHomeIcons(
  req: Request,
  iconIndex: Map<string, string>,
  payload: ReturnType<typeof buildHomePayload>,
) {
  return {
    ...payload,
    heroBanners: payload.heroBanners.map((banner) => {
      if (!banner.app) return banner;
      return {
        ...banner,
        app: withResolvedSummaryIcon(req, iconIndex, banner.app),
      };
    }),
    sections: payload.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        withResolvedSummaryIcon(req, iconIndex, item),
      ),
    })),
  };
}

function parseAppsArray(fileText: string): RawApp[] {
  const marker = "export const generatedStoreApps";
  const markerPos = fileText.indexOf(marker);
  if (markerPos === -1) throw new Error("generatedStoreApps marker not found");

  const assignPos = fileText.indexOf("=", markerPos);
  if (assignPos === -1) throw new Error("apps assignment not found");

  const arrayStart = fileText.indexOf("[", assignPos);
  if (arrayStart === -1) throw new Error("apps array start not found");

  let depth = 0;
  let inString = false;
  let escaped = false;
  let arrayEnd = -1;

  for (let i = arrayStart; i < fileText.length; i++) {
    const ch = fileText[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
  }

  if (arrayEnd === -1) throw new Error("apps array end not found");

  const jsonArrayText = fileText.slice(arrayStart, arrayEnd + 1);
  const parsed = JSON.parse(jsonArrayText);
  if (!Array.isArray(parsed))
    throw new Error("generatedStoreApps is not an array");
  return parsed as RawApp[];
}

async function ensureCache(): Promise<Cache> {
  const fileStat = await stat(APPS_FILE);
  if (
    cache &&
    cache.mtimeMs === fileStat.mtimeMs &&
    cache.size === fileStat.size
  ) {
    return cache;
  }
  if (cacheLoadPromise) return cacheLoadPromise;

  cacheLoadPromise = (async () => {
    const startedAt = Date.now();
    logInfo(`cache reload start source=${APPS_FILE}`);

    const fileText = await Bun.file(APPS_FILE).text();
    const apps = parseAppsArray(fileText);

    const byId = new Map<string, RawApp>();
    const summaries: SummaryApp[] = [];

    for (const app of apps) {
      const id = String(app.id ?? "");
      if (!id) continue;
      byId.set(id, app);
      summaries.push(pickSummary(app));
    }

    const nextCache: Cache = {
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      apps,
      byId,
      summaries,
    };
    cache = nextCache;

    const elapsed = Date.now() - startedAt;
    const sampleIds = summaries
      .slice(0, 5)
      .map((a) => a.id)
      .join(",");
    logInfo(
      `cache reload done apps=${summaries.length} elapsedMs=${elapsed} sampleIds=[${sampleIds}]`,
    );

    return nextCache;
  })();

  try {
    return await cacheLoadPromise;
  } finally {
    cacheLoadPromise = null;
  }
}

function invalidateAppsCache(reason: string): void {
  cache = null;
  cacheLoadPromise = null;
  logInfo(`cache invalidated reason=${reason}`);
}

function scheduleAppsCacheReload(reason: string): void {
  if (appsReloadTimer) clearTimeout(appsReloadTimer);
  appsReloadTimer = setTimeout(async () => {
    appsReloadTimer = null;
    invalidateAppsCache(reason);
    try {
      await ensureCache();
      logInfo(`cache realtime sync done reason=${reason}`);
    } catch (error) {
      logInfo(
        `cache realtime sync failed reason=${reason} error=${String(error)}`,
      );
    }
  }, 200);
}

function startRealtimeCacheSync(): void {
  if (!REALTIME_CACHE_SYNC_ENABLED || appsFileWatcherStarted) return;
  appsFileWatcherStarted = true;

  const watchDir = path.dirname(APPS_FILE);
  const watchFile = path.basename(APPS_FILE);

  try {
    watch(watchDir, (eventType, fileName) => {
      if (!fileName) return;
      if (String(fileName) !== watchFile) return;
      scheduleAppsCacheReload(`fs.watch:${eventType}`);
    });
    logInfo(`realtime cache sync enabled source=${APPS_FILE}`);
  } catch (error) {
    appsFileWatcherStarted = false;
    logInfo(`realtime cache sync disabled error=${String(error)}`);
  }
}
function okJson(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      ...(init.headers ?? {}),
    },
  });
}

function badRequest(message: string): Response {
  return okJson({ error: message }, { status: 400 });
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase().trim();
}

function parseInstallsEstimate(value: string): number {
  const cleaned = value.replace(/[,\s+]/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)([KMB])?/i);
  if (!match) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  const suffix = (match[2] ?? "").toUpperCase();
  if (suffix === "K") return Math.round(base * 1_000);
  if (suffix === "M") return Math.round(base * 1_000_000);
  if (suffix === "B") return Math.round(base * 1_000_000_000);
  return Math.round(base);
}

function byInstallsThenReviews(a: SummaryApp, b: SummaryApp): number {
  return (
    parseInstallsEstimate(b.installs) - parseInstallsEstimate(a.installs) ||
    b.reviews - a.reviews
  );
}

function byGrossing(a: SummaryApp, b: SummaryApp): number {
  const gross = (item: SummaryApp) =>
    item.reviews * (item.price.toLowerCase().includes("free") ? 8 : 14) +
    parseInstallsEstimate(item.installs);
  return gross(b) - gross(a);
}

function parseReleaseDateKey(value: string): number {
  const normalized = value.trim();
  if (!normalized) return 0;

  const direct = Date.parse(normalized);
  if (Number.isFinite(direct)) return direct;

  const isoMatch = normalized.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  return 0;
}

function pickExistingByIds(
  list: SummaryApp[],
  ids: string[],
  limit: number,
): SummaryApp[] {
  const idSet = new Set(ids);
  return list.filter((item) => idSet.has(item.id)).slice(0, limit);
}

function mergeFeaturedItems(
  featured: SummaryApp[],
  items: SummaryApp[],
  limit: number,
): SummaryApp[] {
  const seen = new Set<string>();
  const merged: SummaryApp[] = [];
  for (const item of [...featured, ...items]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

function buildHomePayload(
  c: Cache,
  mode: "apps" | "games" | "all",
  featuredIconIds: string[] = [],
) {
  const baseList =
    mode === "games"
      ? c.summaries.filter((item) => item.category.startsWith("GAME_"))
      : mode === "apps"
        ? c.summaries.filter((item) => !item.category.startsWith("GAME_"))
        : c.summaries;

  const editorsChoiceIds = [
    "com.fgol.HungrySharkEvolution",
    "com.ea.games.simsfreeplay_na",
    "com.square_enix.android_googleplay.ffl_gp",
    "com.mojang.minecraftpe",
  ];

  const heroBanners = HISTORICAL_HOME_BANNERS.map((seed) => {
    const live =
      baseList.find((item) => item.id === seed.id) ??
      c.summaries.find((item) => item.id === seed.id) ??
      null;
    return {
      ...seed,
      app: live,
    };
  }).filter((item) => item.app !== null);

  const free = baseList
    .filter(
      (item) =>
        item.price.toLowerCase().includes("free") ||
        item.price.trim() === "0" ||
        item.price.trim() === "0.0",
    )
    .sort(byInstallsThenReviews)
    .slice(0, 18);

  const paid = baseList
    .filter(
      (item) =>
        !(
          item.price.toLowerCase().includes("free") ||
          item.price.trim() === "0" ||
          item.price.trim() === "0.0"
        ),
    )
    .sort(byInstallsThenReviews)
    .slice(0, 18);

  const grossing = [...baseList].sort(byGrossing).slice(0, 18);
  const editorsChoice = pickExistingByIds(baseList, editorsChoiceIds, 18);
  const popularGames = c.summaries
    .filter((item) => item.category.startsWith("GAME_"))
    .sort(byInstallsThenReviews)
    .slice(0, 18);
  const featuredFromIcons = pickExistingByIds(c.summaries, featuredIconIds, 18);

  const sections: HomeSection[] = [
    {
      key: "editors_choice",
      title: "Editors' Choice",
      rationale:
        "Historical collection path visible in archived Play Store scripts as /store/apps/collection/editors_choice.",
      items: mergeFeaturedItems(featuredFromIcons, editorsChoice, 18),
    },
    {
      key: "top_free",
      title: "Top Free",
      rationale:
        "Persistent Play Store home/chart block from the 2013-2014 era.",
      items: free,
    },
    {
      key: "top_paid",
      title: "Top Paid",
      rationale:
        "Persistent Play Store home/chart block from the 2013-2014 era.",
      items: paid,
    },
    {
      key: "top_grossing",
      title: "Top Grossing",
      rationale:
        "Documented historical chart used by Google Play in that period.",
      items: grossing,
    },
    {
      key: "popular_games",
      title: "Games",
      rationale:
        "Archived navigation/script references include /store/apps/category/GAME as a first-class destination.",
      items: popularGames,
    },
  ].filter((section) => section.items.length > 0);

  return {
    source: {
      description:
        "Historically-inspired Google Play home feed assembled from Wayback and current dataset matches.",
      references: [
        "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
        "https://web.archive.org/web/20130906015415/https://play.google.com/store/apps/category/GAME",
      ],
    },
    mode,
    heroBanners,
    sections,
  };
}

function getRequestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function logRequestStart(req: Request): number {
  const url = new URL(req.url);
  const ip = getRequestIp(req);
  logInfo(
    `request start method=${req.method} path=${url.pathname} query=${url.search || "-"} ip=${ip}`,
  );
  return Date.now();
}

function logRequestEnd(
  req: Request,
  status: number,
  startedAt: number,
  extra: string = "",
): void {
  const url = new URL(req.url);
  const elapsed = Date.now() - startedAt;
  const suffix = extra ? ` ${extra}` : "";
  logInfo(
    `request end method=${req.method} path=${url.pathname} status=${status} elapsedMs=${elapsed}${suffix}`,
  );
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  routes: {
    "/health": (req) => {
      const startedAt = logRequestStart(req);
      const response = okJson({ ok: true });
      logRequestEnd(req, 200, startedAt);
      return response;
    },
    "/auth/register": async (req) => {
      const startedAt = logRequestStart(req);
      const body = await readJsonBody<{
        email?: string;
        password?: string;
        firstName?: string;
        lastName?: string;
        country?: string;
      }>(req);
      if (!body) {
        const response = badRequest("invalid json body");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const email = normalizeEmail(String(body.email ?? ""));
      const password = String(body.password ?? "");
      const firstName = String(body.firstName ?? "").trim();
      const lastName = String(body.lastName ?? "").trim();
      const country = String(body.country ?? "")
        .trim()
        .toUpperCase();

      if (!email || !email.includes("@")) {
        const response = badRequest("valid email is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }
      if (password.length < 8) {
        const response = badRequest("password must be at least 8 characters");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const db = await ensureUsersDb();
      if (db.users.some((item) => item.email === email)) {
        const response = okJson(
          { error: "email already exists" },
          { status: 409 },
        );
        logRequestEnd(req, 409, startedAt, `email=${email}`);
        return response;
      }

      const user: UserRecord = {
        id: randomBytes(12).toString("hex"),
        email,
        firstName,
        lastName,
        country,
        createdAt: nowIso(),
        passwordHash: createPasswordHash(password),
        favoriteAppIds: [],
        libraryAppIds: [],
      };
      const session: SessionRecord = {
        token: randomBytes(32).toString("hex"),
        userId: user.id,
        createdAt: nowIso(),
      };

      db.users.push(user);
      db.sessions.push(session);
      await saveUsersDb(db);

      const response = okJson(
        { token: session.token, user: userPublic(user) },
        { status: 201 },
      );
      logRequestEnd(req, 201, startedAt, `email=${email}`);
      return response;
    },
    "/auth/login": async (req) => {
      const startedAt = logRequestStart(req);
      const body = await readJsonBody<{ email?: string; password?: string }>(
        req,
      );
      if (!body) {
        const response = badRequest("invalid json body");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const email = normalizeEmail(String(body.email ?? ""));
      const password = String(body.password ?? "");
      const db = await ensureUsersDb();
      const user = db.users.find((item) => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        const response = okJson(
          { error: "invalid credentials" },
          { status: 401 },
        );
        logRequestEnd(req, 401, startedAt, `email=${email || "-"}`);
        return response;
      }

      const session: SessionRecord = {
        token: randomBytes(32).toString("hex"),
        userId: user.id,
        createdAt: nowIso(),
      };
      db.sessions.push(session);
      await saveUsersDb(db);

      const response = okJson({ token: session.token, user: userPublic(user) });
      logRequestEnd(req, 200, startedAt, `email=${email}`);
      return response;
    },
    "/auth/me": async (req) => {
      const startedAt = logRequestStart(req);
      const auth = await requireAuth(req);
      if (!auth) {
        const response = okJson({ error: "unauthorized" }, { status: 401 });
        logRequestEnd(req, 401, startedAt);
        return response;
      }
      const response = okJson({ user: userPublic(auth.user) });
      logRequestEnd(req, 200, startedAt, `userId=${auth.user.id}`);
      return response;
    },
    "/auth/logout": async (req) => {
      const startedAt = logRequestStart(req);
      const auth = await requireAuth(req);
      if (!auth) {
        const response = okJson({ error: "unauthorized" }, { status: 401 });
        logRequestEnd(req, 401, startedAt);
        return response;
      }
      auth.db.sessions = auth.db.sessions.filter(
        (item) => item.token !== auth.token,
      );
      await saveUsersDb(auth.db);
      const response = okJson({ ok: true });
      logRequestEnd(req, 200, startedAt, `userId=${auth.user.id}`);
      return response;
    },
    "/apps": async (req) => {
      const startedAt = logRequestStart(req);
      const c = await ensureCache();
      const iconIndex = await getLocalIconIndex();
      const url = new URL(req.url);

      const mode = url.searchParams.get("mode") ?? "all";
      const q = normalizeForSearch(url.searchParams.get("q") ?? "");
      const category = (url.searchParams.get("category") ?? "").trim();
      const chart = (url.searchParams.get("chart") ?? "").trim();
      const offset = Math.max(
        0,
        Number(url.searchParams.get("offset") ?? "0") || 0,
      );
      const limitRaw =
        Number(url.searchParams.get("limit") ?? String(APPS_PAGE_SIZE)) ||
        APPS_PAGE_SIZE;
      const limit = Math.min(APPS_PAGE_SIZE, Math.max(1, limitRaw));

      let list = c.summaries;
      if (mode === "games") {
        list = list.filter((app) => app.category.startsWith("GAME_"));
      } else if (mode !== "all" && mode !== "apps") {
        const response = badRequest("mode must be all, apps, or games");
        logRequestEnd(req, 400, startedAt, `mode=${mode}`);
        return response;
      }

      if (category) {
        list = list.filter((app) => app.category === category);
      }

      if (q) {
        list = list.filter((app) => {
          return (
            normalizeForSearch(app.name).includes(q) ||
            normalizeForSearch(app.publisher).includes(q) ||
            normalizeForSearch(app.category).includes(q)
          );
        });
      }

      if (chart) {
        switch (chart) {
          case "top_paid":
            list = list
              .filter(
                (item) =>
                  !(
                    item.price.toLowerCase().includes("free") ||
                    item.price.trim() === "0" ||
                    item.price.trim() === "0.0"
                  ),
              )
              .sort(byInstallsThenReviews);
            break;
          case "top_free":
            list = list
              .filter(
                (item) =>
                  item.price.toLowerCase().includes("free") ||
                  item.price.trim() === "0" ||
                  item.price.trim() === "0.0",
              )
              .sort(byInstallsThenReviews);
            break;
          case "top_grossing":
            list = [...list].sort(byGrossing);
            break;
          case "top_new_free":
            list = list
              .filter(
                (item) =>
                  item.price.toLowerCase().includes("free") ||
                  item.price.trim() === "0" ||
                  item.price.trim() === "0.0",
              )
              .sort(
                (a, b) =>
                  parseReleaseDateKey(b.subtitle) -
                    parseReleaseDateKey(a.subtitle) ||
                  byInstallsThenReviews(a, b),
              );
            break;
          case "top_new_paid":
            list = list
              .filter(
                (item) =>
                  !(
                    item.price.toLowerCase().includes("free") ||
                    item.price.trim() === "0" ||
                    item.price.trim() === "0.0"
                  ),
              )
              .sort(
                (a, b) =>
                  parseReleaseDateKey(b.subtitle) -
                    parseReleaseDateKey(a.subtitle) ||
                  byInstallsThenReviews(a, b),
              );
            break;
          default: {
            const response = badRequest(
              "chart must be top_paid, top_free, top_grossing, top_new_free, or top_new_paid",
            );
            logRequestEnd(req, 400, startedAt, `chart=${chart}`);
            return response;
          }
        }
      }

      const total = list.length;
      const items = list
        .slice(offset, offset + limit)
        .map((item) => withResolvedSummaryIcon(req, iconIndex, item));
      const idsPreview = items.slice(0, 10).map((app) => app.id);

      const response = okJson({
        total,
        offset,
        limit,
        hasMore: offset + items.length < total,
        items,
      });

      logRequestEnd(
        req,
        200,
        startedAt,
        `mode=${mode} chart=${chart || "-"} category=${category || "-"} q=${q || "-"} offset=${offset} limit=${limit} returned=${items.length} total=${total} idsPreview=[${idsPreview.join(",")}]`,
      );

      return response;
    },
    "/apps/:id": async (req) => {
      const startedAt = logRequestStart(req);
      const c = await ensureCache();
      const iconIndex = await getLocalIconIndex();
      const reviewsDb = await ensureReviewsDb();
      const url = new URL(req.url);
      const id = decodeURIComponent(
        url.pathname.replace(/^\/apps\//, ""),
      ).trim();
      if (!id) {
        const response = badRequest("id is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const app = c.byId.get(id);
      if (!app) {
        const response = okJson({ error: "not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `id=${id}`);
        return response;
      }

      const packageReviews = reviewsForPackage(reviewsDb, id);
      const detailedApp =
        packageReviews.length > 0
          ? applyReviewSummaryToRawApp(app, buildReviewSummary(packageReviews))
          : app;
      const response = okJson({
        app: withResolvedRawIcon(
          req,
          iconIndex,
          normalizeAppDetails(detailedApp),
        ),
      });
      logRequestEnd(req, 200, startedAt, `id=${id}`);
      return response;
    },
    "/app": async (req) => {
      const startedAt = logRequestStart(req);
      const c = await ensureCache();
      const iconIndex = await getLocalIconIndex();
      const reviewsDb = await ensureReviewsDb();
      const url = new URL(req.url);
      const id = String(url.searchParams.get("id") ?? "").trim();
      if (!id) {
        const response = badRequest("id is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const app = c.byId.get(id);
      if (!app) {
        const response = okJson({ error: "not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `id=${id}`);
        return response;
      }

      const packageReviews = reviewsForPackage(reviewsDb, id);
      const detailedApp =
        packageReviews.length > 0
          ? applyReviewSummaryToRawApp(app, buildReviewSummary(packageReviews))
          : app;
      const response = okJson({
        app: withResolvedRawIcon(
          req,
          iconIndex,
          normalizeAppDetails(detailedApp),
        ),
      });
      logRequestEnd(req, 200, startedAt, `id=${id}`);
      return response;
    },
    "/reviews/:appId": async (req) => {
      const startedAt = logRequestStart(req);
      const c = await ensureCache();
      const url = new URL(req.url);
      const appId = decodeURIComponent(
        url.pathname.replace(/^\/reviews\//, ""),
      ).trim();
      if (!appId) {
        const response = badRequest("appId is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }
      if (!c.byId.has(appId)) {
        const response = okJson({ error: "app not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `appId=${appId}`);
        return response;
      }

      if (req.method === "GET") {
        const auth = await requireAuth(req);
        const offset = Math.max(
          0,
          Number(url.searchParams.get("offset") ?? "0") || 0,
        );
        const limit = Math.min(
          20,
          Math.max(1, Number(url.searchParams.get("limit") ?? "5") || 5),
        );
        const db = await ensureReviewsDb();
        const packageReviews = reviewsForPackage(db, appId);
        const summary = buildReviewSummary(packageReviews);
        const items = packageReviews.slice(offset, offset + limit);
        const myReview = auth
          ? (packageReviews.find((item) => item.userId === auth.user.id) ??
            null)
          : null;

        const response = okJson({
          appId,
          offset,
          limit,
          hasMore: offset + items.length < packageReviews.length,
          totalReviews: summary.totalReviews,
          averageRating: summary.averageRating,
          ratingCountText: summary.ratingCountText,
          histogram: summary.histogram,
          myReview,
          items,
        });
        logRequestEnd(
          req,
          200,
          startedAt,
          `appId=${appId} offset=${offset} limit=${limit} returned=${items.length} total=${packageReviews.length} userId=${auth?.user.id ?? "-"}`,
        );
        return response;
      }

      if (req.method === "POST") {
        const auth = await requireAuth(req);
        if (!auth) {
          const response = okJson({ error: "unauthorized" }, { status: 401 });
          logRequestEnd(req, 401, startedAt);
          return response;
        }
        const body = await readJsonBody<{
          rating?: number;
          title?: string;
          text?: string;
          appVersion?: string;
          deviceLabel?: string;
        }>(req);
        if (!body) {
          const response = badRequest("invalid json body");
          logRequestEnd(req, 400, startedAt);
          return response;
        }

        const rating = normalizeReviewRating(body.rating);
        const title = fixMojibake(String(body.title ?? "").trim()).slice(
          0,
          120,
        );
        const text = fixMojibake(String(body.text ?? "").trim()).slice(0, 4000);
        const appVersion = String(body.appVersion ?? "")
          .trim()
          .slice(0, 64);
        const deviceLabel = String(body.deviceLabel ?? "")
          .trim()
          .slice(0, 64);

        if (!rating) {
          const response = badRequest("rating must be between 1 and 5");
          logRequestEnd(req, 400, startedAt, `appId=${appId}`);
          return response;
        }
        if (!text) {
          const response = badRequest("text is required");
          logRequestEnd(req, 400, startedAt, `appId=${appId}`);
          return response;
        }

        const db = await ensureReviewsDb();
        const existingIndex = db.reviews.findIndex(
          (item) => item.packageId === appId && item.userId === auth.user.id,
        );
        const authorName = userPublic(auth.user).name;
        const now = nowIso();
        const nextReview: ReviewRecord = {
          id:
            existingIndex >= 0
              ? db.reviews[existingIndex]!.id
              : randomBytes(10).toString("hex"),
          packageId: appId,
          userId: auth.user.id,
          authorName,
          title,
          text,
          rating,
          createdAt:
            existingIndex >= 0 ? db.reviews[existingIndex]!.createdAt : now,
          updatedAt: now,
          appVersion,
          deviceLabel,
        };

        if (existingIndex >= 0) {
          db.reviews[existingIndex] = nextReview;
        } else {
          db.reviews.push(nextReview);
        }
        await saveReviewsDb(db);

        const packageReviews = reviewsForPackage(db, appId);
        const summary = buildReviewSummary(packageReviews);
        const items = packageReviews.slice(0, 5);
        const response = okJson({
          ok: true,
          appId,
          review: nextReview,
          offset: 0,
          limit: 5,
          totalReviews: summary.totalReviews,
          averageRating: summary.averageRating,
          ratingCountText: summary.ratingCountText,
          histogram: summary.histogram,
          hasMore: packageReviews.length > items.length,
          items,
          myReview: nextReview,
        });
        logRequestEnd(
          req,
          200,
          startedAt,
          `appId=${appId} userId=${auth.user.id} created=${existingIndex < 0}`,
        );
        return response;
      }

      const response = badRequest("method must be GET or POST");
      logRequestEnd(req, 400, startedAt, `method=${req.method}`);
      return response;
    },
    "/home": async (req) => {
      const startedAt = logRequestStart(req);
      const c = await ensureCache();
      const iconIndex = await getLocalIconIndex();
      const url = new URL(req.url);
      const modeRaw = url.searchParams.get("mode") ?? "apps";
      const mode =
        modeRaw === "all" || modeRaw === "games" || modeRaw === "apps"
          ? modeRaw
          : null;
      if (!mode) {
        const response = badRequest("mode must be all, apps, or games");
        logRequestEnd(req, 400, startedAt, `mode=${modeRaw}`);
        return response;
      }

      const payload = withResolvedHomeIcons(
        req,
        iconIndex,
        buildHomePayload(c, mode, [...iconIndex.keys()]),
      );
      const response = okJson(payload);
      logRequestEnd(
        req,
        200,
        startedAt,
        `mode=${mode} banners=${payload.heroBanners.length} sections=${payload.sections.length}`,
      );
      return response;
    },
    "/favorites": async (req) => {
      const startedAt = logRequestStart(req);
      const auth = await requireAuth(req);
      if (!auth) {
        const response = okJson({ error: "unauthorized" }, { status: 401 });
        logRequestEnd(req, 401, startedAt);
        return response;
      }
      const c = await ensureCache();
      const iconIndex = await getLocalIconIndex();
      const items = auth.user.favoriteAppIds
        .map((id) => c.byId.get(id))
        .filter((item): item is RawApp => Boolean(item))
        .map((item) =>
          withResolvedRawIcon(req, iconIndex, normalizeAppDetails(item)),
        );
      const response = okJson({
        items,
        favoriteAppIds: auth.user.favoriteAppIds,
      });
      logRequestEnd(
        req,
        200,
        startedAt,
        `userId=${auth.user.id} count=${items.length}`,
      );
      return response;
    },
    "/favorites/:appId": async (req) => {
      const startedAt = logRequestStart(req);
      const auth = await requireAuth(req);
      if (!auth) {
        const response = okJson({ error: "unauthorized" }, { status: 401 });
        logRequestEnd(req, 401, startedAt);
        return response;
      }

      const url = new URL(req.url);
      const appId = decodeURIComponent(
        url.pathname.replace(/^\/favorites\//, ""),
      ).trim();
      if (!appId) {
        const response = badRequest("appId is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const c = await ensureCache();
      if (!c.byId.has(appId)) {
        const response = okJson({ error: "app not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `appId=${appId}`);
        return response;
      }

      const exists = auth.user.favoriteAppIds.includes(appId);
      if (req.method === "POST") {
        if (!exists) auth.user.favoriteAppIds.push(appId);
      } else if (req.method === "DELETE") {
        auth.user.favoriteAppIds = auth.user.favoriteAppIds.filter(
          (id) => id !== appId,
        );
      } else {
        const response = badRequest("method must be POST or DELETE");
        logRequestEnd(req, 400, startedAt, `method=${req.method}`);
        return response;
      }

      auth.user.favoriteAppIds = [...new Set(auth.user.favoriteAppIds)];
      await saveUsersDb(auth.db);

      const response = okJson({
        ok: true,
        favoriteAppIds: auth.user.favoriteAppIds,
        isFavorite: auth.user.favoriteAppIds.includes(appId),
      });
      logRequestEnd(
        req,
        200,
        startedAt,
        `userId=${auth.user.id} appId=${appId} method=${req.method}`,
      );
      return response;
    },
    "/library": async (req) => {
      const startedAt = logRequestStart(req);
      const auth = await requireAuth(req);
      if (!auth) {
        const response = okJson({ error: "unauthorized" }, { status: 401 });
        logRequestEnd(req, 401, startedAt);
        return response;
      }
      const c = await ensureCache();
      const iconIndex = await getLocalIconIndex();
      const items = auth.user.libraryAppIds
        .map((id) => c.byId.get(id))
        .filter((item): item is RawApp => Boolean(item))
        .map((item) =>
          withResolvedRawIcon(req, iconIndex, normalizeAppDetails(item)),
        );
      const response = okJson({
        items,
        libraryAppIds: auth.user.libraryAppIds,
      });
      logRequestEnd(
        req,
        200,
        startedAt,
        `userId=${auth.user.id} count=${items.length}`,
      );
      return response;
    },
    "/library/:appId": async (req) => {
      const startedAt = logRequestStart(req);
      const auth = await requireAuth(req);
      if (!auth) {
        const response = okJson({ error: "unauthorized" }, { status: 401 });
        logRequestEnd(req, 401, startedAt);
        return response;
      }

      const url = new URL(req.url);
      const appId = decodeURIComponent(
        url.pathname.replace(/^\/library\//, ""),
      ).trim();
      if (!appId) {
        const response = badRequest("appId is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      const c = await ensureCache();
      if (!c.byId.has(appId)) {
        const response = okJson({ error: "app not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `appId=${appId}`);
        return response;
      }

      const exists = auth.user.libraryAppIds.includes(appId);
      if (req.method === "POST") {
        if (!exists) auth.user.libraryAppIds.push(appId);
      } else if (req.method === "DELETE") {
        auth.user.libraryAppIds = auth.user.libraryAppIds.filter(
          (id) => id !== appId,
        );
      } else {
        const response = badRequest("method must be POST or DELETE");
        logRequestEnd(req, 400, startedAt, `method=${req.method}`);
        return response;
      }

      auth.user.libraryAppIds = [...new Set(auth.user.libraryAppIds)];
      await saveUsersDb(auth.db);

      const response = okJson({
        ok: true,
        libraryAppIds: auth.user.libraryAppIds,
        isInLibrary: auth.user.libraryAppIds.includes(appId),
      });
      logRequestEnd(
        req,
        200,
        startedAt,
        `userId=${auth.user.id} appId=${appId} method=${req.method}`,
      );
      return response;
    },
    "/unsupported-apps": async (req) => {
      const startedAt = logRequestStart(req);
      const url = new URL(req.url);

      if (req.method === "GET") {
        const apiLevel = normalizeApiLevel(url.searchParams.get("api"));
        if (apiLevel == null) {
          const response = badRequest("api must be a positive integer");
          logRequestEnd(req, 400, startedAt);
          return response;
        }

        const packageIds = await readUnsupportedApps(apiLevel);
        const response = okJson({ apiLevel, packageIds });
        logRequestEnd(
          req,
          200,
          startedAt,
          `api=${apiLevel} count=${packageIds.length}`,
        );
        return response;
      }

      if (req.method === "POST") {
        const body = await readJsonBody<{
          apiLevel?: number;
          packageId?: string;
        }>(req);
        if (!body) {
          const response = badRequest("invalid json body");
          logRequestEnd(req, 400, startedAt);
          return response;
        }

        const apiLevel = normalizeApiLevel(body.apiLevel);
        const packageId = String(body.packageId ?? "").trim();

        if (apiLevel == null) {
          const response = badRequest("apiLevel must be a positive integer");
          logRequestEnd(req, 400, startedAt);
          return response;
        }
        if (!PACKAGE_ID_RE.test(packageId)) {
          const response = badRequest("packageId is invalid");
          logRequestEnd(req, 400, startedAt);
          return response;
        }

        const nextPackageIds = [
          ...(await readUnsupportedApps(apiLevel)),
          packageId,
        ];
        await saveUnsupportedApps(apiLevel, nextPackageIds);

        const packageIds = await readUnsupportedApps(apiLevel);
        const response = okJson({ apiLevel, packageIds }, { status: 201 });
        logRequestEnd(
          req,
          201,
          startedAt,
          `api=${apiLevel} packageId=${packageId} count=${packageIds.length}`,
        );
        return response;
      }

      const response = badRequest("method must be GET or POST");
      logRequestEnd(req, 400, startedAt, `method=${req.method}`);
      return response;
    },
    "/icons/:file": async (req) => {
      const startedAt = logRequestStart(req);
      const iconIndex = await getLocalIconIndex();
      const url = new URL(req.url);
      const fileName = decodeURIComponent(
        url.pathname.replace(/^\/icons\//, ""),
      ).trim();
      if (!fileName || ![...iconIndex.values()].includes(fileName)) {
        const response = okJson({ error: "not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `file=${fileName || "-"}`);
        return response;
      }

      const response = new Response(Bun.file(path.join(ICONS_DIR, fileName)), {
        headers: {
          "access-control-allow-origin": "*",
        },
      });
      logRequestEnd(req, 200, startedAt, `file=${fileName}`);
      return response;
    },
    "/media": async (req) => {
      const startedAt = logRequestStart(req);
      const url = new URL(req.url);
      const source = (url.searchParams.get("url") ?? "").trim();
      if (!source) {
        const response = badRequest("url is required");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      let target: URL;
      try {
        target = new URL(source);
      } catch {
        const response = badRequest("url is invalid");
        logRequestEnd(req, 400, startedAt);
        return response;
      }

      if (
        !/^https?:$/i.test(target.protocol) ||
        !isAllowedMediaHost(target.hostname)
      ) {
        const response = badRequest("url host is not allowed");
        logRequestEnd(req, 400, startedAt, `host=${target.hostname}`);
        return response;
      }

      const timeout = Number(
        url.searchParams.get("timeoutMs") ?? String(MEDIA_PROXY_TIMEOUT_MS),
      );
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        Math.max(1000, timeout || MEDIA_PROXY_TIMEOUT_MS),
      );

      try {
        const upstream = await fetch(target.toString(), {
          headers: {
            "user-agent": "play-google-api-media-proxy/1.0",
            accept: "image/*,*/*;q=0.8",
          },
          redirect: "follow",
          signal: controller.signal,
        });

        if (!upstream.ok) {
          const response = okJson(
            { error: `upstream failed with ${upstream.status}` },
            { status: 502 },
          );
          logRequestEnd(
            req,
            502,
            startedAt,
            `host=${target.hostname} upstreamStatus=${upstream.status}`,
          );
          return response;
        }

        const contentType =
          upstream.headers.get("content-type") ?? "application/octet-stream";
        const cacheControl =
          upstream.headers.get("cache-control") ?? "public, max-age=86400";

        const response = new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control": cacheControl,
            "access-control-allow-origin": "*",
          },
        });
        logRequestEnd(req, 200, startedAt, `host=${target.hostname}`);
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const response = okJson(
          { error: `media fetch failed: ${message}` },
          { status: 502 },
        );
        logRequestEnd(
          req,
          502,
          startedAt,
          `host=${target.hostname} error=${message}`,
        );
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    "/apk/:packageId": async (req) => {
      const startedAt = logRequestStart(req);
      const url = new URL(req.url);
      const packageId = decodeURIComponent(
        url.pathname.replace(/^\/apk\//, ""),
      ).trim();

      if (!PACKAGE_ID_RE.test(packageId)) {
        const response = badRequest("packageId is invalid");
        logRequestEnd(req, 400, startedAt, `packageId=${packageId || "-"}`);
        return response;
      }

      const filePath = path.join(APK_DIR, `${packageId}.apk`);
      try {
        const info = await stat(filePath);
        if (!info.isFile()) {
          const response = okJson({ error: "not found" }, { status: 404 });
          logRequestEnd(req, 404, startedAt, `packageId=${packageId}`);
          return response;
        }
      } catch {
        const response = okJson({ error: "not found" }, { status: 404 });
        logRequestEnd(req, 404, startedAt, `packageId=${packageId}`);
        return response;
      }

      const response = new Response(Bun.file(filePath), {
        headers: {
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": `attachment; filename="${packageId}.apk"`,
          "access-control-allow-origin": "*",
        },
      });
      logRequestEnd(req, 200, startedAt, `packageId=${packageId}`);
      return response;
    },
  },
  fetch(req) {
    const startedAt = logRequestStart(req);
    if (req.method === "OPTIONS") {
      const response = okJson({ ok: true });
      logRequestEnd(req, 200, startedAt);
      return response;
    }
    const response = okJson({ error: "not found" }, { status: 404 });
    logRequestEnd(req, 404, startedAt);
    return response;
  },
});

logInfo(`started on http://${HOST}:${PORT}`);
logInfo(`source: ${APPS_FILE}`);
startRealtimeCacheSync();

void ensureCache()
  .then(() => logInfo("cache warmup complete"))
  .catch((err) => logInfo(`cache warmup failed error=${String(err)}`));
