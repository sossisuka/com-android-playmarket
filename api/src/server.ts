import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";

type RawApp = {
  id?: string;
  name?: string;
  publisher?: string;
  subtitle?: string;
  category?: string;
  price?: string;
  installs?: string;
  color?: string;
  icon?: string;
  image?: string;
  trailerImage?: string;
  trailerUrl?: string;
  screenshots?: string[];
  reviews?: number;
  [key: string]: unknown;
};

type SummaryApp = {
  id: string;
  name: string;
  publisher: string;
  subtitle: string;
  category: string;
  price: string;
  installs: string;
  color: string;
  icon: string;
  trailerImage: string;
  trailerUrl: string;
  reviews: number;
};

type Cache = {
  mtimeMs: number;
  apps: RawApp[];
  byId: Map<string, RawApp>;
  summaries: SummaryApp[];
};

type HomeBannerSeed = {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceDate: string;
};

type HomeSection = {
  key: string;
  title: string;
  rationale: string;
  items: SummaryApp[];
};

type UserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  createdAt: string;
  passwordHash: string;
  favoriteAppIds: string[];
  libraryAppIds: string[];
};

type SessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
};

type UsersDb = {
  users: UserRecord[];
  sessions: SessionRecord[];
};

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 8787);
const APPS_FILE =
  process.env.APPS_FILE ??
  path.resolve(import.meta.dir, "./data/apps.generated.ts");
const USERS_DB_FILE =
  process.env.USERS_DB_FILE ??
  path.resolve(import.meta.dir, "./data/users.db.ts");
const UNSUPPORTED_APPS_DIR = path.resolve(import.meta.dir, "./data");
const UNSUPPORTED_APPS_FILE = path.join(
  UNSUPPORTED_APPS_DIR,
  "unsupported_apps_api.json",
);
const ICONS_DIR = path.resolve(import.meta.dir, "./data/icons");
const APK_DIR = path.resolve(import.meta.dir, "./data/apk");
const APPS_PAGE_SIZE = 20;
const PACKAGE_ID_RE = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)+$/;

let localIconIndexCache: Map<string, string> | null = null;
let localIconIndexPromise: Promise<Map<string, string>> | null = null;

const HISTORICAL_HOME_BANNERS: HomeBannerSeed[] = [
  {
    id: "com.mobiata.flighttrack",
    title: "FlightTrack",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh6.ggpht.com/Pwpjm-P-aj30sKGXHEjxwB8jPhFoOOP8x3P2VQNjA-de_7I5ZNShjz8IEVM8_ZUzdrHX=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.com2us.deadcity.normal.freefull.google.global.android.common",
    title: "Dead City",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh3.ggpht.com/7t2-L6WQjBYoU1o06U2MbtPgypZQYTo6-ZQgzbEg288iER_KNe8PWGjnW0VHVhQa2eI9=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.liquable.nemo",
    title: "Cubie Messenger",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh5.ggpht.com/Y2zFkklcg8KGR4b8_fhtqdrYK1hXGzisH-iU5Enp5dFk2f8L_HJMQVbiW7Qz-phfpg=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.distractionware.superhexagon",
    title: "Super Hexagon",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/lJ1f0zVcAuQGQLNQSyuJpyjYCfeuyhk1VxdYalct48CSXQLTmNqef33XrlHkBygKQwA=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.disney.ToyStorySmashIt.goo",
    title: "Toy Story: Smash It!",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/EbophPRx71MratD8CueiDfocB3H8LWzLRFBddGaf74pb6sM4jxBSQMzA486BIAnJVfY=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.touchten.trainlegend",
    title: "Train Legend",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/3zMxcWbp-RBQwxffVQUiE4DBlBRMivyG0vXH6sbA8bmktkFQCZsS-nsH5yrK23cy2D0=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.mobilesrepublic.appy",
    title: "News Republic",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh3.ggpht.com/czmjvJiSpcLzulj4YGsDgea2D02nuDhObYjN1wFa6KRhIPpaEYd6eYuhVoNNTScJS0Q=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.fgol.HungrySharkEvolution",
    title: "Hungry Shark Evolution",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/080ctL04m5ztxOVZAhtNU_t9fROnk-vLLy1nUaUckMTXAzE3yJcvSQiyTULyPUiqvCV3=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.otakumode.otakucamera",
    title: "Otaku Camera",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh3.ggpht.com/lrjoOADn32a4XHbocp4ZvJOo1ZAk_7FFBiN37IhP9EfpboCua77yNAzFAq0Jgl0bSS7O=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
  {
    id: "com.square_enix.android_googleplay.ffl_gp",
    title: "FINAL FANTASY DIMENSIONS",
    imageUrl:
      "https://web.archive.org/web/20130307213821/https://lh4.ggpht.com/5eP1j6Y_nmUEo6sdtu1D8rmh_qEX695exA_I7hyOv8fPzTSO1pWjbQAu9PjsuCfG97P5=w609-h297",
    sourceUrl:
      "https://web.archive.org/web/20130307213821/https://play.google.com/store/apps",
    sourceDate: "2013-03-07",
  },
];

let cache: Cache | null = null;
let cacheLoadPromise: Promise<Cache> | null = null;
let usersDbCache: UsersDb | null = null;
let usersDbLoadPromise: Promise<UsersDb> | null = null;

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
    icon: String(app.icon ?? ""),
    trailerImage: String(app.trailerImage ?? ""),
    trailerUrl: String(app.trailerUrl ?? ""),
    reviews: Number(app.reviews ?? 0),
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
        if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
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
  const first = primary.trim();
  if (/^https?:\/\//i.test(first)) return first;

  const second = secondary.trim();
  if (/^https?:\/\//i.test(second)) return second;

  return first || second;
}

function withResolvedSummaryIcon(
  req: Request,
  iconIndex: Map<string, string>,
  app: SummaryApp,
): SummaryApp {
  return {
    ...app,
    icon: resolvedIconUrl(
      req,
      iconIndex,
      app.id,
      pickRemoteIconFallback(app.icon),
    ),
  };
}

function withResolvedRawIcon(
  req: Request,
  iconIndex: Map<string, string>,
  app: RawApp,
): RawApp {
  const id = String(app.id ?? "").trim();
  if (!id) return app;
  return {
    ...app,
    icon: resolvedIconUrl(
      req,
      iconIndex,
      id,
      pickRemoteIconFallback(String(app.icon ?? ""), String(app.image ?? "")),
    ),
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
  if (cache && cache.mtimeMs === fileStat.mtimeMs) return cache;
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

      const response = okJson({
        app: withResolvedRawIcon(req, iconIndex, normalizeAppDetails(app)),
      });
      logRequestEnd(req, 200, startedAt, `id=${id}`);
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

void ensureCache()
  .then(() => logInfo("cache warmup complete"))
  .catch((err) => logInfo(`cache warmup failed error=${String(err)}`));
