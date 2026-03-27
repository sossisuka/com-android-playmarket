import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { runSyncPackages } from "./sync-google-play.mjs";

const APPS_FILE = path.resolve("src/data/apps.generated.ts");
const ICONS_DIR = path.resolve("src/data/icons");
const MISSING_APPS_FILE = path.resolve("src/data/missing_apps.json");
const EXPORT_NAME = "generatedStoreApps";
const CURRENT_YEAR = new Date().getUTCFullYear();
const MIN_ARCHIVE_YEAR = 2012;
const DEFAULT_FROM_YEAR = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_FROM_YEAR ??
    process.env.PLAY_ARCHIVE_SYNC_YEAR ??
    String(MIN_ARCHIVE_YEAR),
  10,
);
const DEFAULT_TO_YEAR = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_TO_YEAR ?? String(CURRENT_YEAR),
  10,
);
const DEFAULT_ICON_YEAR = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_ICON_YEAR ?? "0",
  10,
);
const DEFAULT_ICON_CHUNK_SIZE = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_ICON_CHUNK_SIZE ?? "100",
  10,
);
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_TIMEOUT_MS ?? "20000",
  10,
);
const DEFAULT_FALLBACK_STEP_TIMEOUT_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_FALLBACK_STEP_TIMEOUT_MS ?? "45000",
  10,
);
const DEFAULT_DETAIL_PROBE_LIMIT = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_DETAIL_PROBE_LIMIT ?? "12",
  10,
);
const DEFAULT_MEDIA_VALIDATE_TIMEOUT_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_MEDIA_VALIDATE_TIMEOUT_MS ?? "15000",
  10,
);
const DEFAULT_MEDIA_FALLBACK_PROBE_LIMIT = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_MEDIA_FALLBACK_PROBE_LIMIT ?? "32",
  10,
);
const DEFAULT_RETRY_COUNT = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_RETRIES ?? "4",
  10,
);
const DEFAULT_PAGE_LIMIT = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_PAGE_LIMIT ?? "0",
  10,
);
const DEFAULT_APP_LIMIT = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_APP_LIMIT ?? "0",
  10,
);
const DEFAULT_SNAPSHOT_CONCURRENCY = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_SNAPSHOT_CONCURRENCY ?? "3",
  10,
);
const CDX_CALLS_PER_SECOND = Number.parseFloat(
  process.env.PLAY_ARCHIVE_SYNC_CDX_CALLS_PER_SECOND ?? "0.75",
);
const PAGE_CALLS_PER_SECOND = Number.parseFloat(
  process.env.PLAY_ARCHIVE_SYNC_PAGE_CALLS_PER_SECOND ?? "1.5",
);
const IMAGE_CALLS_PER_SECOND = Number.parseFloat(
  process.env.PLAY_ARCHIVE_SYNC_IMAGE_CALLS_PER_SECOND ?? "3",
);
const DEFAULT_RATE_LIMIT_DELAY_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_RATE_LIMIT_DELAY_MS ?? "60000",
  10,
);
const MAX_RATE_LIMIT_DELAY_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_MAX_RATE_LIMIT_DELAY_MS ?? "900000",
  10,
);
const USER_AGENT =
  process.env.PLAY_ARCHIVE_SYNC_USER_AGENT ??
  "play-google-api-archive-sync/1.0 (+local script)";
const SOURCE_CATEGORY_SLUGS = [
  "BOOKS_AND_REFERENCE",
  "BUSINESS",
  "COMICS",
  "COMMUNICATION",
  "EDUCATION",
  "ENTERTAINMENT",
  "FINANCE",
  "HEALTH_AND_FITNESS",
  "LIBRARIES_AND_DEMO",
  "LIFESTYLE",
  "APP_WALLPAPER",
  "MEDIA_AND_VIDEO",
  "MEDICAL",
  "MUSIC_AND_AUDIO",
  "NEWS_AND_MAGAZINES",
  "PERSONALIZATION",
  "PHOTOGRAPHY",
  "PRODUCTIVITY",
  "SHOPPING",
  "SOCIAL",
  "SPORTS",
  "TOOLS",
  "TRANSPORTATION",
  "TRAVEL_AND_LOCAL",
  "WEATHER",
  "APP_WIDGETS",
  "GAME_ACTION",
  "GAME_ADVENTURE",
  "GAME_ARCADE",
  "GAME_BOARD",
  "GAME_CARD",
  "GAME_CASINO",
  "GAME_EDUCATIONAL",
  "GAME_FAMILY",
  "GAME_WALLPAPER",
  "GAME_MUSIC",
  "GAME_PUZZLE",
  "GAME_RACING",
  "GAME_ROLE_PLAYING",
  "GAME_SIMULATION",
  "GAME_SPORTS",
  "GAME_STRATEGY",
  "GAME_TRIVIA",
  "GAME_WIDGETS",
  "GAME_WORD",
];
const SOURCE_PAGES = [
  "https://play.google.com/store/apps",
  "https://play.google.com/store/apps/new",
  "http://play.google.com/store/apps/top",
  ...SOURCE_CATEGORY_SLUGS.map(
    (slug) => `https://play.google.com/store/apps/category/${slug}`,
  ),
];
const YEAR_RE = /^\d{4}$/;
const TIMESTAMP_RE = /^\d{14}$/;
const PACKAGE_ID_RE = /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)+$/;
const CATEGORY_GAME_SLUGS = new Set([
  "ACTION",
  "ADVENTURE",
  "ARCADE",
  "BOARD",
  "BRAIN",
  "CARD",
  "CARDS",
  "CASINO",
  "CASUAL",
  "EDUCATIONAL",
  "MUSIC",
  "PUZZLE",
  "RACING",
  "ROLE_PLAYING",
  "SIMULATION",
  "SPORTS",
  "SPORTS_GAMES",
  "STRATEGY",
  "TRIVIA",
  "WORD",
]);
const MONTHS = new Map([
  ["january", 1],
  ["tammikuu", 1],
  ["tammikuuta", 1],
  ["jan", 1],
  ["januar", 1],
  ["janvier", 1],
  ["enero", 1],
  ["gennaio", 1],
  ["janeiro", 1],
  ["stycznia", 1],
  ["february", 2],
  ["helmikuu", 2],
  ["helmikuuta", 2],
  ["feb", 2],
  ["februar", 2],
  ["fevrier", 2],
  ["fevrier", 2],
  ["febrero", 2],
  ["fevereiro", 2],
  ["febbraio", 2],
  ["lutego", 2],
  ["march", 3],
  ["maaliskuu", 3],
  ["maaliskuuta", 3],
  ["mar", 3],
  ["marz", 3],
  ["mars", 3],
  ["marzo", 3],
  ["marca", 3],
  ["april", 4],
  ["huhtikuu", 4],
  ["huhtikuuta", 4],
  ["apr", 4],
  ["avril", 4],
  ["abril", 4],
  ["aprile", 4],
  ["kwietnia", 4],
  ["may", 5],
  ["toukokuu", 5],
  ["toukokuuta", 5],
  ["mai", 5],
  ["mayo", 5],
  ["maio", 5],
  ["maggio", 5],
  ["maja", 5],
  ["june", 6],
  ["kesakuu", 6],
  ["kesakuuta", 6],
  ["jun", 6],
  ["juin", 6],
  ["junio", 6],
  ["giugno", 6],
  ["czerwca", 6],
  ["july", 7],
  ["heinakuu", 7],
  ["heinakuuta", 7],
  ["jul", 7],
  ["juillet", 7],
  ["julio", 7],
  ["luglio", 7],
  ["lipca", 7],
  ["august", 8],
  ["elokuu", 8],
  ["elokuuta", 8],
  ["aug", 8],
  ["aout", 8],
  ["agosto", 8],
  ["sierpnia", 8],
  ["september", 9],
  ["syyskuu", 9],
  ["syyskuuta", 9],
  ["sep", 9],
  ["sept", 9],
  ["septembre", 9],
  ["septiembre", 9],
  ["settembre", 9],
  ["wrzesnia", 9],
  ["october", 10],
  ["lokakuu", 10],
  ["lokakuuta", 10],
  ["oct", 10],
  ["oktober", 10],
  ["octobre", 10],
  ["octubre", 10],
  ["ottobre", 10],
  ["pazdziernika", 10],
  ["november", 11],
  ["marraskuu", 11],
  ["marraskuuta", 11],
  ["nov", 11],
  ["novembre", 11],
  ["noviembre", 11],
  ["listopada", 11],
  ["december", 12],
  ["joulukuu", 12],
  ["joulukuuta", 12],
  ["dec", 12],
  ["dezember", 12],
  ["decembre", 12],
  ["diciembre", 12],
  ["dicembre", 12],
  ["dezembro", 12],
  ["grudnia", 12],
]);
const SIMILAR_CLUSTER_HEADINGS = new Set([
  "similar",
  "similar apps",
  "similar content",
  "vergelijkbaar",
  "related apps",
  "related content",
  "類似內容",
  "类似内容",
  "類似应用",
  "類似應用",
  "類似アプリ",
  "похожие приложения",
  "схожие приложения",
]);

function normalizePackageIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => PACKAGE_ID_RE.test(item)),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function sanitizeRelationIds(values, currentPackageId = "", limit = 3) {
  const seen = new Set();
  const currentId = String(currentPackageId ?? "").trim();
  if (PACKAGE_ID_RE.test(currentId)) {
    seen.add(currentId);
  }

  const normalized = [];
  for (const value of values ?? []) {
    const packageId = String(value ?? "").trim();
    if (!PACKAGE_ID_RE.test(packageId) || seen.has(packageId)) continue;
    seen.add(packageId);
    normalized.push(packageId);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function parsePackageIdsInput(rawValue, label = "--packages") {
  const valid = [];
  const invalid = [];

  for (const token of String(rawValue ?? "")
    .split(/[\s,;\n\r\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)) {
    if (PACKAGE_ID_RE.test(token)) {
      valid.push(token);
    } else {
      invalid.push(token);
    }
  }

  if (invalid.length > 0) {
    console.warn(
      `[archive-sync] ignored invalid package ids from ${label}: ${invalid.join(", ")}`,
    );
  }

  return valid;
}

async function loadMissingApps(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return new Set(normalizePackageIds(JSON.parse(text)));
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }
}

async function saveMissingApps(filePath, missingApps) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = normalizePackageIds([...missingApps]);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function markMissingApp(packageId, reason, missingApps) {
  const id = String(packageId ?? "").trim();
  if (!PACKAGE_ID_RE.test(id)) return;
  if (missingApps.has(id)) return;
  missingApps.add(id);
  await saveMissingApps(MISSING_APPS_FILE, missingApps);
  logArchiveSync("missing:add", `id=${id} reason=${reason}`);
}

async function unmarkMissingApp(packageId, reason, missingApps) {
  const id = String(packageId ?? "").trim();
  if (!PACKAGE_ID_RE.test(id)) return false;
  if (!missingApps.has(id)) return false;
  missingApps.delete(id);
  await saveMissingApps(MISSING_APPS_FILE, missingApps);
  logArchiveSync("missing:remove", `id=${id} reason=${reason}`);
  return true;
}

async function reconcileMissingApps(existingIds, missingApps) {
  let changed = false;
  for (const packageId of existingIds) {
    if (!missingApps.has(packageId)) continue;
    missingApps.delete(packageId);
    changed = true;
    logArchiveSync(
      "missing:reconcile",
      `id=${packageId} reason=already-present-in-apps`,
    );
  }
  if (changed) {
    await saveMissingApps(MISSING_APPS_FILE, missingApps);
  }
}

function parseArgs(argv) {
  const options = {
    fromYear: DEFAULT_FROM_YEAR,
    toYear: DEFAULT_TO_YEAR,
    pageLimit: DEFAULT_PAGE_LIMIT,
    appLimit: DEFAULT_APP_LIMIT,
    packages: [],
    forceIcons: false,
    skipIcons: false,
    iconYear: DEFAULT_ICON_YEAR,
    iconChunkSize: DEFAULT_ICON_CHUNK_SIZE,
    snapshotConcurrency: DEFAULT_SNAPSHOT_CONCURRENCY,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--force-icons") {
      options.forceIcons = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--skip-icons") {
      options.skipIcons = true;
      continue;
    }

    if (arg.startsWith("--year=")) {
      const year = Number.parseInt(arg.slice("--year=".length), 10);
      options.fromYear = year;
      options.toYear = year;
      continue;
    }

    if (arg.startsWith("--from-year=")) {
      options.fromYear = Number.parseInt(arg.slice("--from-year=".length), 10);
      continue;
    }

    if (arg.startsWith("--to-year=")) {
      options.toYear = Number.parseInt(arg.slice("--to-year=".length), 10);
      continue;
    }

    if (arg.startsWith("--limit-pages=")) {
      options.pageLimit = Number.parseInt(
        arg.slice("--limit-pages=".length),
        10,
      );
      continue;
    }

    if (arg.startsWith("--limit-apps=")) {
      options.appLimit = Number.parseInt(arg.slice("--limit-apps=".length), 10);
      continue;
    }

    if (arg.startsWith("--packages=")) {
      const parsed = parsePackageIdsInput(
        arg.slice("--packages=".length),
        "--packages",
      );
      options.packages = Array.from(new Set([...options.packages, ...parsed]));
      continue;
    }

    if (arg.startsWith("--package=")) {
      const parsed = parsePackageIdsInput(
        arg.slice("--package=".length),
        "--package",
      );
      options.packages = Array.from(new Set([...options.packages, ...parsed]));
      continue;
    }

    if (arg.startsWith("--package-id=")) {
      const parsed = parsePackageIdsInput(
        arg.slice("--package-id=".length),
        "--package-id",
      );
      options.packages = Array.from(new Set([...options.packages, ...parsed]));
      continue;
    }

    if (arg.startsWith("--icon-year=")) {
      options.iconYear = Number.parseInt(arg.slice("--icon-year=".length), 10);
      continue;
    }

    if (arg.startsWith("--icon-chunk-size=")) {
      options.iconChunkSize = Number.parseInt(
        arg.slice("--icon-chunk-size=".length),
        10,
      );
      continue;
    }

    if (arg.startsWith("--snapshot-concurrency=")) {
      options.snapshotConcurrency = Number.parseInt(
        arg.slice("--snapshot-concurrency=".length),
        10,
      );
    }
  }

  return options;
}

function assertYear(year, label) {
  if (
    !Number.isInteger(year) ||
    !YEAR_RE.test(String(year)) ||
    year < MIN_ARCHIVE_YEAR
  ) {
    throw new Error(
      `${label} must be a 4-digit year >= ${MIN_ARCHIVE_YEAR}. Got: ${year}`,
    );
  }

  if (year > CURRENT_YEAR) {
    throw new Error(
      `${label} must be <= current year ${CURRENT_YEAR}. Got: ${year}`,
    );
  }
}

function resolveYearRange(fromYear, toYear) {
  assertYear(fromYear, "fromYear");
  assertYear(toYear, "toYear");

  if (fromYear > toYear) {
    throw new Error(`fromYear must be <= toYear. Got: ${fromYear} > ${toYear}`);
  }

  return Array.from(
    { length: toYear - fromYear + 1 },
    (_, index) => fromYear + index,
  );
}

function normalizeRequestedYearRange(options) {
  const normalized = { ...options };
  if (
    Number.isInteger(normalized.fromYear) &&
    normalized.fromYear < MIN_ARCHIVE_YEAR
  ) {
    console.warn(
      `[archive-sync] fromYear ${normalized.fromYear} is below supported range, using ${MIN_ARCHIVE_YEAR}`,
    );
    normalized.fromYear = MIN_ARCHIVE_YEAR;
  }

  if (
    Number.isInteger(normalized.toYear) &&
    normalized.toYear < MIN_ARCHIVE_YEAR
  ) {
    console.warn(
      `[archive-sync] toYear ${normalized.toYear} is below supported range, using ${MIN_ARCHIVE_YEAR}`,
    );
    normalized.toYear = MIN_ARCHIVE_YEAR;
  }

  return normalized;
}

function toPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}

function logArchiveSync(stage, message) {
  console.log(`[archive-sync][${nowIso()}][${stage}] ${message}`);
}

function findMatchingArrayEnd(text, startIndex) {
  let depth = 0;
  let stringQuote = "";
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (stringQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === stringQuote) {
        stringQuote = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function findMatchingTagEnd(text, startIndex, tagName) {
  const source = String(text ?? "");
  if (!source || startIndex < 0) return -1;

  const tokenRe = new RegExp(`<${tagName}\\b[^>]*>|</${tagName}>`, "gi");
  tokenRe.lastIndex = startIndex;

  let depth = 0;
  let match;
  while ((match = tokenRe.exec(source))) {
    const token = match[0] ?? "";
    const index = match.index ?? -1;
    if (index < startIndex) continue;

    if (/^<\//.test(token)) {
      if (depth <= 0) continue;
      depth -= 1;
      if (depth === 0) {
        return index + token.length;
      }
      continue;
    }

    depth += 1;
  }

  return -1;
}

function parseGeneratedArray(sourceText, exportName) {
  const marker = `export const ${exportName}`;
  const markerIndex = sourceText.indexOf(marker);
  if (markerIndex < 0) return [];

  const assignIndex = sourceText.indexOf("=", markerIndex);
  if (assignIndex < 0) return [];

  const startIndex = sourceText.indexOf("[", assignIndex);
  if (startIndex < 0) return [];

  const endIndex = findMatchingArrayEnd(sourceText, startIndex);
  if (endIndex < 0) return [];

  const payload = sourceText.slice(startIndex, endIndex + 1);

  try {
    return JSON.parse(payload);
  } catch (jsonError) {
    try {
      const parsed = Function(`"use strict"; return (${payload});`)();
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    throw jsonError;
  }
}

async function loadAppsFile(sourcePath) {
  const text = await readFile(sourcePath, "utf8");
  const apps = parseGeneratedArray(text, EXPORT_NAME);
  const byId = new Map();

  for (const app of apps) {
    const id = String(app?.id ?? "").trim();
    if (!id) continue;
    byId.set(id, app);
  }

  return { text, apps, byId };
}

function serializeApps(apps) {
  return [
    'import type { AppData } from "./apps";',
    "",
    "// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.",
    `// Generated at: ${new Date().toISOString()}`,
    `// Source: Google Play archive sync (web.archive.org, ${MIN_ARCHIVE_YEAR}+ pages).`,
    "",
    `export const ${EXPORT_NAME}: AppData[] = ${JSON.stringify(apps, null, 2)};`,
    "",
  ].join("\n");
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value ?? "").replace(/<[^>]+>/g, " "));
}

function cleanText(value) {
  return stripTags(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeAttribute(value) {
  return decodeHtmlEntities(String(value ?? "").trim());
}

function normalizeArchiveUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("https://web.archive.org/")) return raw;
  if (raw.startsWith("http://web.archive.org/")) {
    return `https://${raw.slice("http://".length)}`;
  }
  if (raw.startsWith("//web.archive.org/")) return `https:${raw}`;
  if (raw.startsWith("/web/")) return `https://web.archive.org${raw}`;
  return raw;
}

function normalizeArchiveMediaUrl(value) {
  let raw = normalizeArchiveUrl(decodeAttribute(value));
  if (!raw) return "";
  if (raw.startsWith("//")) raw = `https:${raw}`;

  const waybackMatch = raw.match(
    /^https?:\/\/web\.archive\.org\/web\/\d{14}(?:[a-z_]+)?\/(.+)$/i,
  );
  if (waybackMatch?.[1]) {
    raw = waybackMatch[1];
  }

  if (raw.startsWith("//")) raw = `https:${raw}`;
  if (/^http:\/\//i.test(raw)) {
    raw = `https://${raw.slice("http://".length)}`;
  }

  return raw;
}

function sanitizeMediaUrl(value) {
  const raw = normalizeArchiveMediaUrl(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "web.archive.org") return "";
  } catch {
    return "";
  }

  return raw;
}

function sanitizeMediaList(values) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const normalized = sanitizeMediaUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function mediaIdentityKey(value) {
  const raw = normalizeArchiveMediaUrl(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    let pathname = parsed.pathname;
    if (
      host.endsWith(".ggpht.com") ||
      host === "ggpht.com" ||
      host.endsWith("googleusercontent.com")
    ) {
      pathname = pathname.replace(/=[^/?#]+$/i, "");
    }
    return `${host}${pathname}`;
  } catch {
    return raw;
  }
}

function isDirectMediaUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  return (
    host.endsWith(".ggpht.com") ||
    host === "ggpht.com" ||
    host.endsWith("googleusercontent.com") ||
    host.endsWith("ytimg.com")
  );
}

function collectAllMatches(value, pattern, groupIndex = 1) {
  const matches = [];
  for (const match of String(value ?? "").matchAll(pattern)) {
    const candidate = decodeAttribute(match[groupIndex] ?? "");
    if (candidate) matches.push(candidate);
  }
  return matches;
}

function normalizeYoutubeUrl(rawUrl) {
  const value = normalizeArchiveMediaUrl(String(rawUrl ?? "").trim());
  if (!value) return undefined;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined;
  }

  if (!host.endsWith("youtube.com")) return undefined;

  const videoId = parsed.searchParams.get("v");
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (pathParts[0] === "embed" && pathParts[1]) {
    return `https://www.youtube.com/watch?v=${pathParts[1]}`;
  }
  if (pathParts[0] === "v" && pathParts[1]) {
    return `https://www.youtube.com/watch?v=${pathParts[1]}`;
  }

  return undefined;
}

function buildYoutubeThumbnailUrl(rawUrl) {
  const normalized = normalizeYoutubeUrl(rawUrl);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    const videoId = parsed.searchParams.get("v");
    if (!videoId) return "";
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  } catch {
    return "";
  }
}

function pickFirstMediaUrl(candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeArchiveMediaUrl(candidate);
    if (isDirectMediaUrl(normalized)) return normalized;
  }
  return "";
}

function extractDetailMedia(html) {
  const screenshots = [];
  const screenshotCandidates = [
    ...collectAllMatches(
      html,
      /<div[^>]*class="[^"]*\bscreenshot-image-wrapper\b[^"]*"[^>]*data-baseurl="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*data-screenshot-index="[^"]+"[^>]*data-src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*data-screenshot-index="[^"]+"[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<button[^>]*data-screenshot-item-index="[^"]+"[^>]*>\s*<img[^>]*data-src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<button[^>]*data-screenshot-item-index="[^"]+"[^>]*>\s*<img[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*itemprop="screenshot"[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*src="([^"]+)"[^>]*itemprop="screenshot"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*class="[^"]*\bfull-screenshot\b[^"]*"[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*class="[^"]*\bscreenshot\b[^"]*"[^>]*src="([^"]+)"/gi,
    ),
  ];

  const screenshotSeen = new Set();
  for (const candidate of screenshotCandidates) {
    const normalized = normalizeArchiveMediaUrl(candidate);
    const identity = mediaIdentityKey(normalized);
    if (
      !isDirectMediaUrl(normalized) ||
      !identity ||
      screenshotSeen.has(identity)
    ) {
      continue;
    }
    screenshotSeen.add(identity);
    screenshots.push(normalized);
  }

  let trailerImage = pickFirstMediaUrl([
    ...collectAllMatches(html, /<video[^>]*poster="([^"]+)"/gi),
    ...collectAllMatches(
      html,
      /<div[^>]*class="[^"]*\bMSLVtf\b[^"]*"[\s\S]*?<img[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<span[^>]*class="[^"]*\bdetails-trailer\b[^"]*"[\s\S]*?<img[^>]*class="[^"]*\bvideo-image\b[^"]*"[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*class="[^"]*\bvideo-image\b[^"]*"[^>]*src="([^"]+)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<img[^>]*class="[^"]*\bpreview-image\b[^"]*"[^>]*src="([^"]+)"/gi,
    ),
  ]);

  let trailerUrl;
  for (const candidate of [
    ...collectAllMatches(html, /data-trailer-url="([^"]+)"/gi),
    ...collectAllMatches(
      html,
      /<span[^>]*class="[^"]*\b(?:preview-overlay-container|play-action-container)\b[^"]*"[^>]*data-video-url="([^"]+)"/gi,
    ),
    ...collectAllMatches(html, /data-video-url="([^"]+)"/gi),
    ...collectAllMatches(
      html,
      /<a[^>]*href="([^"]*(?:youtube\.com|youtu\.be)[^"]*)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<a[^>]*href="([^"]*web\.archive\.org\/web\/[^"]*(?:youtube\.com|youtu\.be)[^"]*)"/gi,
    ),
    ...collectAllMatches(
      html,
      /<(?:object|param|embed)[^>]*(?:data|value|src)="([^"]*(?:youtube\.com|youtu\.be)[^"]*)"/gi,
    ),
  ]) {
    const normalized = normalizeYoutubeUrl(decodeAttribute(candidate));
    if (normalized) {
      trailerUrl = normalized;
      break;
    }
  }

  if (!trailerImage && trailerUrl) {
    trailerImage = buildYoutubeThumbnailUrl(trailerUrl);
  }

  return {
    trailerImage,
    trailerUrl,
    screenshots,
  };
}

function extractWaybackTimestamp(value) {
  return String(value ?? "").match(/\/web\/(\d{14})(?:[a-z_]+)?\//i)?.[1] ?? "";
}

function toIsoDateFromTimestamp(timestamp) {
  if (!TIMESTAMP_RE.test(String(timestamp))) return "";
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

function normalizeDateToken(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocalizedDateToIso(value, fallbackTimestamp = "") {
  const source = cleanText(value);
  if (!source) return toIsoDateFromTimestamp(fallbackTimestamp);

  const normalized = normalizeDateToken(source);
  const directMatch = normalized.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2].padStart(2, "0")}-${directMatch[3].padStart(2, "0")}`;
  }

  const dayMonthYear = normalized.match(
    /(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})/,
  );
  if (dayMonthYear) {
    const month = MONTHS.get(dayMonthYear[2]);
    if (month) {
      return `${dayMonthYear[3]}-${String(month).padStart(2, "0")}-${dayMonthYear[1].padStart(2, "0")}`;
    }
  }

  const monthDayYear = normalized.match(/([a-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (monthDayYear) {
    const month = MONTHS.get(monthDayYear[1]);
    if (month) {
      return `${monthDayYear[3]}-${String(month).padStart(2, "0")}-${monthDayYear[2].padStart(2, "0")}`;
    }
  }

  return toIsoDateFromTimestamp(fallbackTimestamp);
}

function normalizeInstalls(value) {
  const text = cleanText(value);
  if (!text) return "";
  const matches = [...text.matchAll(/\d[\d\s,.]*/g)]
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (matches.length >= 2) {
    return `${matches[0]} - ${matches[1]}`;
  }
  return text;
}

function normalizePrice(metaValue, textValue) {
  const raw = cleanText(metaValue) || cleanText(textValue);
  if (!raw || raw === "0" || raw === "0.0" || raw === "0,0") {
    return "FREE";
  }

  const compact = raw
    .replace(/\b(?:buy|install|download|open|update)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const usdMatch = compact.match(/\$\s*([\d.,]+)/);
  if (usdMatch?.[1]) return `USD ${usdMatch[1]}`;

  const eurMatch = compact.match(/(?:€|в‚¬)\s*([\d.,]+)/i);
  if (eurMatch?.[1]) return `EUR ${eurMatch[1]}`;

  const gbpMatch = compact.match(/(?:£|ВЈ)\s*([\d.,]+)/i);
  if (gbpMatch?.[1]) return `GBP ${gbpMatch[1]}`;

  if (raw.startsWith("$")) return `USD ${raw.slice(1).trim()}`;
  if (raw.startsWith("€")) return `EUR ${raw.slice(1).trim()}`;
  if (raw.startsWith("£")) return `GBP ${raw.slice(1).trim()}`;

  return compact;
}

function normalizeUsdAmount(value) {
  const source = cleanText(value);
  if (!source) return "";

  const amountMatch = source.match(/(\d[\d\s.,\u00a0]*)/);
  if (!amountMatch?.[1]) return "";

  let token = amountMatch[1].replace(/\u00a0/g, "").replace(/\s+/g, "");
  if (!token) return "";

  const hasComma = token.includes(",");
  const hasDot = token.includes(".");
  if (hasComma && hasDot) {
    const lastComma = token.lastIndexOf(",");
    const lastDot = token.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    token = token.split(thousandSep).join("");
    if (decimalSep === ",") token = token.replace(/,/g, ".");
  } else if (hasComma) {
    const firstComma = token.indexOf(",");
    const fracLength = token.length - firstComma - 1;
    token =
      fracLength === 3 ? token.replace(/,/g, "") : token.replace(/,/g, ".");
  } else if (hasDot) {
    const parts = token.split(".");
    if (parts.length > 2) {
      const frac = parts.pop() ?? "";
      token = `${parts.join("")}.${frac}`;
    }
  }

  const numeric = Number.parseFloat(token);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function normalizeUsdPrice(metaValue, textValue) {
  const raw = cleanText(metaValue) || cleanText(textValue);
  if (!raw || raw === "0" || raw === "0.0" || raw === "0,0") {
    return "FREE";
  }

  const normalized = normalizeDateToken(raw);
  if (
    /\b(free|gratuit|gratis|бесплатно|bezplatna|gratuito|kostenlos)\b/i.test(
      normalized,
    )
  ) {
    return "FREE";
  }

  const compact = raw
    .replace(/\b(?:buy|install|download|open|update)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const explicitUsdAmount = normalizeUsdAmount(
    firstMatch(compact, [
      /(?:US\$|USD|\$)\s*([\d.,\u00a0 ]+)/i,
      /([\d.,\u00a0 ]+)\s*(?:US\$|USD|\$)/i,
    ]),
  );
  if (explicitUsdAmount) return `USD ${explicitUsdAmount}`;

  const anyAmount = normalizeUsdAmount(compact);
  if (anyAmount) return `USD ${anyAmount}`;
  return "USD";
}

function normalizeCategorySlug(slug, label = "") {
  const rawSlug = String(slug ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (!rawSlug) return "";
  if (rawSlug.startsWith("GAME_")) return rawSlug;
  if (CATEGORY_GAME_SLUGS.has(rawSlug)) return `GAME_${rawSlug}`;

  const labelNormalized = normalizeDateToken(label);
  if (
    /\b(game|games|juegos|jeu|jeux|gry|gra|giochi|spiele|spiel)\b/.test(
      labelNormalized,
    )
  ) {
    return `GAME_${rawSlug}`;
  }

  return rawSlug;
}

function hashToColor(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `hsl(${hash % 360} 45% 45%)`;
}

function normalizeDescriptionBlocks(value) {
  const html = String(value ?? "");
  if (!html) return [];

  const text = decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  );

  return text
    .split(/\n{2,}/g)
    .map((item) =>
      item
        .replace(/\s+\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function extractLeadingText(value) {
  const source = String(value ?? "");
  if (!source) return "";

  const leading = firstMatch(source, [/^\s*(?:<[^>]+>\s*)*([^<]+)/]);
  return cleanText(leading || source);
}

const LOCALE_LATIN_RE = /[A-Za-z]/g;
const LOCALE_CYRILLIC_RE = /[\u0400-\u04FF]/g;
const LOCALE_RU_EN_LETTER_RE = /[A-Za-z\u0400-\u04FF]/g;
const LOCALE_ANY_LETTER_RE = /\p{L}/gu;
const LOCALE_LATIN_EXTENDED_RE = /[\u00C0-\u024F]/g;
const LOCALE_DIGIT_RE = /\d/g;
const LOCALE_EN_HINT_RE =
  /\b(and|up|everyone|low|maturity|teen|mature|rated|for|android|requires|version|install|installs|download|free|privacy|policy|new)\b/i;
const LOCALE_DISALLOWED_RE =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0E00-\u0E7F]/g;

function countRegexMatches(value, pattern) {
  const source = String(value ?? "");
  if (!source) return 0;
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function hasDisallowedLocaleChars(value) {
  return countRegexMatches(cleanText(value), LOCALE_DISALLOWED_RE) > 0;
}

function hasOnlyRuEnLetters(value) {
  const text = cleanText(value);
  if (!text) return true;
  const totalLetters = countRegexMatches(text, LOCALE_ANY_LETTER_RE);
  if (totalLetters === 0) return true;
  const ruEnLetters = countRegexMatches(text, LOCALE_RU_EN_LETTER_RE);
  return ruEnLetters === totalLetters;
}

function localeTextScore(value) {
  const text = cleanText(value);
  if (!text) return 0;

  const latin = countRegexMatches(text, LOCALE_LATIN_RE);
  const cyrillic = countRegexMatches(text, LOCALE_CYRILLIC_RE);
  const totalLetters = countRegexMatches(text, LOCALE_ANY_LETTER_RE);
  const ruEnLetters = countRegexMatches(text, LOCALE_RU_EN_LETTER_RE);
  const foreignLetters = Math.max(totalLetters - ruEnLetters, 0);
  const extendedLatin = countRegexMatches(text, LOCALE_LATIN_EXTENDED_RE);
  const digits = countRegexMatches(text, LOCALE_DIGIT_RE);
  const disallowed = countRegexMatches(text, LOCALE_DISALLOWED_RE);

  let score = latin * 3 + cyrillic * 3 + digits * 0.2 - extendedLatin * 0.5;
  score -= foreignLetters * 4;
  if (totalLetters > 0) {
    if (foreignLetters === 0) {
      score += 40;
    } else {
      score -= 80;
    }
  }
  if (disallowed > 0) {
    score -= disallowed * 12;
    score -= 40;
  }
  return score;
}

function localeHintScore(value) {
  const text = cleanText(value);
  if (!text) return 0;
  if (countRegexMatches(text, LOCALE_CYRILLIC_RE) > 0) return 25;
  const normalized = normalizeDateToken(text);
  return LOCALE_EN_HINT_RE.test(normalized) ? 20 : -20;
}

function scoreDetailLocale(detail) {
  const descriptionFirst = Array.isArray(detail?.description)
    ? detail.description[0]
    : "";
  const whatsNewFirst = Array.isArray(detail?.whatsNew)
    ? detail.whatsNew[0]
    : "";
  const normalizedName = normalizeDateToken(detail?.name);

  let score =
    localeTextScore(detail?.name) * 4 +
    localeTextScore(detail?.publisher) * 3 +
    localeTextScore(detail?.contentRating) * 3 +
    localeTextScore(descriptionFirst) * 2 +
    localeTextScore(whatsNewFirst) +
    localeTextScore(detail?.requiresAndroid) +
    localeTextScore(detail?.version) * 0.5 +
    localeTextScore(detail?.installs) * 0.5 +
    localeTextScore(detail?.size) * 0.5;

  score += localeHintScore(detail?.contentRating) * 6;
  score += localeHintScore(detail?.requiresAndroid) * 4;
  score += localeHintScore(detail?.name) * 2;
  if (normalizedName.includes("google play")) {
    score -= 180;
  }
  return score;
}

function detailHasDisallowedLocale(detail) {
  const values = [
    detail?.name,
    detail?.publisher,
    detail?.contentRating,
    detail?.requiresAndroid,
    detail?.version,
    detail?.size,
    detail?.installs,
    ...(Array.isArray(detail?.description)
      ? detail.description.slice(0, 2)
      : []),
    ...(Array.isArray(detail?.whatsNew) ? detail.whatsNew.slice(0, 2) : []),
  ];
  return values.some((item) => hasDisallowedLocaleChars(item));
}

function sanitizeLocaleText(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (hasDisallowedLocaleChars(text)) return "";
  if (!hasOnlyRuEnLetters(text)) return "";
  return text;
}

function sanitizeLocaleBlocks(values) {
  if (!Array.isArray(values)) return [];
  const normalized = [];
  for (const value of values) {
    const text = sanitizeLocaleText(value);
    if (!text) continue;
    normalized.push(text);
  }
  return normalized;
}

function sanitizeDetailLocaleFields(detail) {
  const next = { ...detail };
  next.name = sanitizeLocaleText(next.name);
  next.publisher = sanitizeLocaleText(next.publisher);
  next.price = isBlankText(next.price) ? "" : normalizeUsdPrice("", next.price);
  next.size = sanitizeLocaleText(next.size);
  next.installs = sanitizeLocaleText(next.installs);
  next.version = sanitizeLocaleText(next.version);
  const requiresAndroid = sanitizeLocaleText(next.requiresAndroid);
  next.requiresAndroid =
    requiresAndroid && localeHintScore(requiresAndroid) >= 0
      ? requiresAndroid
      : "";
  const contentRating = sanitizeLocaleText(next.contentRating);
  next.contentRating =
    contentRating && localeHintScore(contentRating) >= 0 ? contentRating : "";
  next.description = sanitizeLocaleBlocks(next.description);
  next.whatsNew = sanitizeLocaleBlocks(next.whatsNew);
  return next;
}

function normalizeAppTitle(value, publisher = "") {
  let text = cleanText(value);
  if (!text) return "";

  text = text
    .replace(
      /\s*[-|–—]\s*(?:android\s+apps?\s+on\s+google\s+play|apps?\s+on\s+google\s+play|google\s+play)\s*$/i,
      "",
    )
    .replace(/\s*[-|–—]\s*[^-|–—]*google\s+play.*$/i, "")
    .replace(/\s*\|\s*google\s+play.*$/i, "")
    .trim();

  if (!text) return "";
  if (
    publisher &&
    normalizeDateToken(text) === normalizeDateToken(cleanText(publisher))
  ) {
    return "";
  }
  return text;
}

function applyLocaleSafeTextFields(baseDetail, candidateDetail) {
  const setIfNonBlank = (key) => {
    const value = sanitizeLocaleText(candidateDetail?.[key]);
    if (!value) return;
    baseDetail[key] = value;
  };

  setIfNonBlank("name");
  setIfNonBlank("publisher");
  setIfNonBlank("size");
  setIfNonBlank("installs");
  setIfNonBlank("version");
  setIfNonBlank("requiresAndroid");
  setIfNonBlank("contentRating");
  if (!isBlankText(candidateDetail?.price)) {
    baseDetail.price = normalizeUsdPrice("", candidateDetail.price);
  }

  const description = sanitizeLocaleBlocks(candidateDetail?.description);
  if (description.length > 0) {
    baseDetail.description = description;
  }
  const whatsNew = sanitizeLocaleBlocks(candidateDetail?.whatsNew);
  if (whatsNew.length > 0) {
    baseDetail.whatsNew = whatsNew;
  }
}

function parseNumber(value) {
  const source = cleanText(value);
  if (!source) return 0;

  const compact = source.match(/([\d.,\s\u00a0]+)\s*([kKmM])/);
  if (compact) {
    const normalized = compact[1]
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, "")
      .replace(",", ".");
    const base = Number.parseFloat(normalized);
    if (Number.isFinite(base)) {
      const factor = compact[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
      return Math.round(base * factor);
    }
  }

  const digits = source.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

function formatCountText(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `(${value.toLocaleString("en-US")})`;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function normalizeMetadataLabel(value) {
  return normalizeDateToken(value)
    .replace(/[:：-]+$/g, "")
    .trim();
}

function classifyMetadataLabel(label) {
  const text = normalizeMetadataLabel(label);
  if (text.includes("paivitetty")) return "updated";
  if (text.includes("päivitetty")) return "updated";
  if (text.includes("koko")) return "size";
  if (text.includes("asennukset")) return "installs";
  if (text.includes("nykyinen versio")) return "version";
  if (text.includes("vaatii android-version")) return "requiresAndroid";
  if (text.includes("sisallon ikarajoitus")) return "contentRating";
  if (text.includes("sisällön ikärajoitus")) return "contentRating";

  if (
    /\b(updated|mise a jour|aktualizacja|actualizado|atualizado|miseajour|обновлено)\b/.test(
      text,
    )
  ) {
    return "updated";
  }
  if (/\b(size|taille|rozmiar|tamano|tamanho|dimensione|размер)\b/.test(text)) {
    return "size";
  }
  if (
    /\b(install|installs|instalacje|installations|instalaciones|installs|количество установок)\b/.test(
      text,
    )
  ) {
    return "installs";
  }
  if (
    /\b(current version|version actuelle|wersja biezaca|version actual|versao atual|versione corrente|текущая версия)\b/.test(
      text,
    )
  ) {
    return "version";
  }
  if (
    /\b(requires android|wymaga androida|necessite android|requiere android|necessita android|требуемая версия android)\b/.test(
      text,
    )
  ) {
    return "requiresAndroid";
  }
  if (
    /\b(content rating|classification du contenu|ocena tresci|clasificacion del contenido|classificacao do conteudo|возрастные ограничения)\b/.test(
      text,
    )
  ) {
    return "contentRating";
  }

  return "";
}

function extractMetadataMap(html) {
  const metadata = new Map();

  const legacyRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  for (const match of html.matchAll(legacyRe)) {
    const key = classifyMetadataLabel(match[1]);
    if (!key || metadata.has(key)) continue;
    metadata.set(key, match[2]);
  }

  const modernRe =
    /<div class="meta-info">[\s\S]*?<div class="title">([\s\S]*?)<\/div>\s*<div class="content[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/div>/gi;
  for (const match of html.matchAll(modernRe)) {
    const key = classifyMetadataLabel(match[1]);
    if (!key || metadata.has(key)) continue;
    metadata.set(key, match[2]);
  }

  const newLayoutRe =
    /<div[^>]*class="[^"]*\bhAyfc\b[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*\bBgcNfc\b[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<span[^>]*class="[^"]*\bhtlgb\b[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi;
  for (const match of html.matchAll(newLayoutRe)) {
    const key = classifyMetadataLabel(match[1]);
    if (!key || metadata.has(key)) continue;
    metadata.set(key, match[2]);
  }

  const modernPairRe =
    /<div[^>]*class="[^"]*\blXlx5\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*\bxg1aie\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(modernPairRe)) {
    const key = classifyMetadataLabel(match[1]);
    if (!key || metadata.has(key)) continue;
    metadata.set(key, match[2]);
  }

  return metadata;
}

function extractOrderedPackageIds(html, excludedIds = []) {
  const seen = new Set(
    excludedIds
      .map((item) => String(item ?? "").trim())
      .filter((item) => PACKAGE_ID_RE.test(item)),
  );
  const ids = [];
  const push = (rawValue) => {
    const packageId = decodeAttribute(rawValue);
    if (!PACKAGE_ID_RE.test(packageId) || seen.has(packageId)) return;
    seen.add(packageId);
    ids.push(packageId);
  };

  for (const match of html.matchAll(/data-docid="([^"]+)"/gi)) {
    push(match[1]);
  }

  for (const match of html.matchAll(/details\?id=([^"&<\s]+)(?:&amp;|&|")/gi)) {
    push(match[1]);
  }

  return ids;
}

function extractPagePackageIds(html) {
  return extractOrderedPackageIds(html);
}

function isSimilarClusterHeading(value) {
  const normalized = normalizeDateToken(cleanText(value));
  if (!normalized) return false;
  if (SIMILAR_CLUSTER_HEADINGS.has(normalized)) return true;
  return /^(?:similar|related)(?:\s+(?:apps?|content))?$/.test(normalized);
}

function isSimilarClusterLink(value) {
  const href = decodeAttribute(value);
  if (!href) return false;
  return (
    /\/store\/apps\/similar\?/i.test(href) ||
    /\/store\/apps\/collection\/similar_apps_/i.test(href) ||
    /\bsimilar_apps_/i.test(href)
  );
}

function extractSimilarPackageIds(html, currentPackageId = "") {
  const ids = [];
  const seen = new Set();
  const currentId = String(currentPackageId ?? "").trim();
  if (PACKAGE_ID_RE.test(currentId)) {
    seen.add(currentId);
  }

  const clusterPatterns = [
    /<div\b[^>]*class="[^"]*\brec-cluster\b[^"]*"[^>]*>/gi,
    /<div\b[^>]*class="[^"]*\buTDLzc\b[^"]*\bdrrice\b[^"]*"[^>]*>/gi,
  ];
  for (const clusterRe of clusterPatterns) {
    for (const match of html.matchAll(clusterRe)) {
      const startIndex = match.index ?? -1;
      if (startIndex < 0) continue;

      const endIndex = findMatchingTagEnd(html, startIndex, "div");
      if (endIndex < 0) continue;

      const clusterHtml = html.slice(startIndex, endIndex);
      const heading = firstMatch(clusterHtml, [
        /<[^>]*class="[^"]*\bheading\b[^"]*"[^>]*>[\s\S]*?<a[^>]*class="[^"]*\btitle-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
        /<div[^>]*class="[^"]*\bheading\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<h[1-6][^>]*class="[^"]*\bheading\b[^"]*"[^>]*>([\s\S]*?)<\/h[1-6]>/i,
        /<h[1-6][^>]*class="[^"]*\bC7Bf8e\b[^"]*"[^>]*>([\s\S]*?)<\/h[1-6]>/i,
      ]);
      const headingHref = firstMatch(clusterHtml, [
        /<[^>]*class="[^"]*\bheading\b[^"]*"[^>]*>[\s\S]*?<a[^>]*class="[^"]*\btitle-link\b[^"]*"[^>]*href="([^"]+)"/i,
        /<a[^>]*href="([^"]+)"[^>]*>\s*<h[1-6][^>]*class="[^"]*\bC7Bf8e\b[^"]*"[^>]*>/i,
        /<a[^>]*class="[^"]*\bsee-more\b[^"]*"[^>]*href="([^"]+)"/i,
        /<a[^>]*class="[^"]*\bLkLjZd\b[^"]*"[^>]*href="([^"]+)"/i,
      ]);
      if (
        !isSimilarClusterHeading(heading) &&
        !isSimilarClusterLink(headingHref)
      ) {
        continue;
      }

      for (const packageId of extractOrderedPackageIds(clusterHtml, [
        ...seen,
      ])) {
        if (seen.has(packageId)) continue;
        seen.add(packageId);
        ids.push(packageId);
        if (ids.length >= 3) return ids;
      }
    }
  }

  return ids;
}

function extractCategory(html) {
  const href = firstMatch(html, [
    /class="document-subtitle category"[^>]*href="([^"]*\/store\/apps\/category\/[^"]+)"/i,
    /<dt>\s*Category:\s*<\/dt>\s*<dd>\s*<a[^>]*href="([^"]*\/store\/apps\/category\/[^"]+)"/i,
    /href="([^"]*\/store\/apps\/category\/[^"]+)"/i,
  ]);
  const label = cleanText(
    firstMatch(html, [
      /class="document-subtitle category"[^>]*>([\s\S]*?)<\/a>/i,
      /<dt>\s*Category:\s*<\/dt>\s*<dd>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
    ]),
  );
  const slugMatch = decodeAttribute(href).match(/category\/([^?"/]+)/i);
  const slug = slugMatch?.[1] ?? "";
  return normalizeCategorySlug(slug, label);
}

function extractDetailFields(html, detailTimestamp, currentPackageId = "") {
  const metadata = extractMetadataMap(html);
  const media = extractDetailMedia(html);
  let name = cleanText(
    firstMatch(html, [
      /<span[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/span>/i,
      /<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i,
      /<h1[^>]*itemprop="name"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
      /<h1[^>]*itemprop="name"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
      /<h1[^>]*class="[^"]*\bAHFaub\b[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
      /<h1[^>]*class="[^"]*\bFd93Bb\b[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
      /<h1[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/h1>/i,
      /<h1[^>]*class="[^"]*\bdocument-title\b[^"]*"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
      /<div class="document-title"[^>]*itemprop="name"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
      /<div class="document-title"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
      /<span itemprop="name" content="([^"]+)"/i,
      /<meta itemprop="name" content="([^"]+)"/i,
    ]),
  );
  const publisher = cleanText(
    firstMatch(html, [
      /<a[^>]*href="[^"]*\/store\/apps\/dev(?:eloper)?\?id=[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /class="document-subtitle primary"[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/a>/i,
      /class="document-subtitle primary"[^>]*>\s*<span[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/span>/i,
      /itemprop="author"[\s\S]*?<span[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/span>/i,
      /itemprop="author"[\s\S]*?<span itemprop="name" content="([^"]+)"/i,
      /itemprop="author"[\s\S]*?<a[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/a>/i,
    ]),
  );
  const normalizedName = normalizeAppTitle(name, publisher);
  if (normalizedName) {
    name = normalizedName;
  } else {
    const titleFallback = normalizeAppTitle(
      firstMatch(html, [
        /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
        /<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i,
        /<title[^>]*>([\s\S]*?)<\/title>/i,
      ]),
      publisher,
    );
    if (titleFallback) {
      name = titleFallback;
    }
  }
  const icon = sanitizeMediaUrl(
    decodeAttribute(
      firstMatch(html, [
        /<div[^>]*class="[^"]*\bdoc-banner-icon\b[^"]*"[\s\S]*?<img[^>]*src="([^"]+)"/i,
        /<div[^>]*class="[^"]*\bcover-container\b[^"]*"[\s\S]*?<img[^>]*class="[^"]*\bcover-image\b[^"]*"[^>]*src="([^"]+)"/i,
        /<img[^>]*class="[^"]*\bcover-image\b[^"]*"[^>]*src="([^"]+)"/i,
        /itemprop="image" content="([^"]+)"/i,
        /content="([^"]+)"[^>]*itemprop="image"/i,
        /itemprop="image"[^>]*src="([^"]+)"/i,
        /<img[^>]*src="([^"]+)"[^>]*itemprop="image"/i,
      ]),
    ),
  );
  const descriptionHtml = firstMatch(html, [
    /<div[^>]*class="[^"]*\bbARER\b[^"]*"[^>]*data-g-id="description"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*\b(?:app-orig-desc|id-app-orig-desc)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div id="doc-original-text"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
    /<meta[^>]*itemprop="description"[^>]*content="([^"]+)"/i,
    /<meta[^>]*content="([^"]+)"[^>]*itemprop="description"/i,
  ]);
  const ratingValueRaw = cleanText(
    firstMatch(html, [
      /itemprop="ratingValue" content="([^"]+)"/i,
      /content="([^"]+)"[^>]*itemprop="ratingValue"/i,
      /<div[^>]*class="[^"]*\baverage-rating-value\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*\bTT9eCd\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*\bjILTFe\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*\bBHMmbe\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div class="score">([\s\S]*?)<\/div>/i,
    ]),
  );
  const ratingCountRaw = cleanText(
    firstMatch(html, [
      /itemprop="ratingCount" content="([^"]+)"/i,
      /content="([^"]+)"[^>]*itemprop="ratingCount"/i,
      /<div[^>]*class="[^"]*\bvotes\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /aria-label="([\d\s.,\u00a0]+)\s*reviews\s*"/i,
      /aria-label="([\d\s.,\u00a0]+)\s*(?:ratings|arviota)"/i,
      /<div[^>]*class="[^"]*\bg1rdde\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*\bEHUI5b\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<span[^>]*class="[^"]*\bAYi5wd\b[^"]*"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /<span class="reviews-num">([\s\S]*?)<\/span>/i,
    ]),
  );
  const priceMeta = cleanText(
    firstMatch(html, [
      /itemprop="price" content="([^"]*)"/i,
      /content="([^"]*)"[^>]*itemprop="price"/i,
    ]),
  );
  const priceText = cleanText(
    firstMatch(html, [
      /itemprop="price" content="[^"]*"[^>]*><\/span>\s*([^<]+)/i,
      /<span class="buy-button-price">([\s\S]*?)<\/span>/i,
    ]),
  );
  const whatsNew = [];
  for (const match of html.matchAll(
    /<div[^>]*class="[^"]*\brecent-change\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  )) {
    const text = match[1]?.trim();
    if (text) whatsNew.push(text);
  }
  if (whatsNew.length === 0) {
    const whatsNewSection = firstMatch(html, [
      /<h2[^>]*>\s*What's New\s*<\/h2>[\s\S]*?<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<h2[^>]*>\s*Что нового\s*<\/h2>[\s\S]*?<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
    ]);
    if (whatsNewSection) {
      whatsNew.push(whatsNewSection);
    }
  }
  const updatedRaw = metadata.get("updated") ?? "";
  const installsRaw =
    metadata.get("installs") ??
    firstMatch(html, [
      /<div[^>]*class="[^"]*\bClM7O\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*\bg1rdde\b[^"]*"[^>]*>\s*Downloads\s*<\/div>/i,
      /<div[^>]*class="[^"]*\bg1rdde\b[^"]*"[^>]*>\s*Downloads\s*<\/div>[\s\S]*?<div[^>]*class="[^"]*\bClM7O\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]);
  const updatedAt = parseLocalizedDateToIso(updatedRaw, detailTimestamp);
  const reviews = parseNumber(ratingCountRaw);
  const ratingValue = Number.parseFloat(ratingValueRaw.replace(",", "."));
  const contentRatingRaw =
    metadata.get("contentRating") ??
    firstMatch(html, [
      /itemprop="contentRating"[^>]*content="([^"]+)"/i,
      /content="([^"]+)"[^>]*itemprop="contentRating"/i,
      /itemprop="contentRating"[^>]*>([\s\S]*?)<\/div>/i,
      /itemprop="contentRating"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i,
    ]);

  return {
    name,
    publisher,
    icon,
    image: icon,
    trailerImage: sanitizeMediaUrl(media.trailerImage) || undefined,
    trailerUrl: media.trailerUrl,
    screenshots: sanitizeMediaList(media.screenshots),
    category: extractCategory(html),
    price: normalizeUsdPrice(priceMeta, priceText),
    updatedAt,
    size: cleanText(metadata.get("size")),
    installs: normalizeInstalls(installsRaw),
    version: cleanText(metadata.get("version")),
    requiresAndroid: cleanText(metadata.get("requiresAndroid")),
    contentRating: extractLeadingText(contentRatingRaw),
    description: normalizeDescriptionBlocks(descriptionHtml),
    whatsNew: normalizeDescriptionBlocks(whatsNew.join("\n")),
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : undefined,
    reviews,
    ratingCountText: formatCountText(reviews),
    similarIds: extractSimilarPackageIds(html, currentPackageId),
  };
}

function isArchiveNotFoundPage(html) {
  const source = String(html ?? "");
  if (!source) return false;
  return (
    /<title>\s*Not Found\s*<\/title>/i.test(source) &&
    /requested URL was not found on this server/i.test(source)
  );
}

const ARCHIVE_NOT_FOUND_MARKER = "[archive-not-found]";

function shouldPersistMissingApp(details) {
  const source = String(details ?? "").toLowerCase();
  if (!source) return false;
  if (
    source.includes("timeout:") ||
    source.includes("429") ||
    source.includes("rate limit") ||
    source.includes("econn") ||
    source.includes("fetch failed") ||
    source.includes("socket") ||
    source.includes("network")
  ) {
    return false;
  }

  const segments = source
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;

  return segments.every(
    (segment) =>
      segment.includes("no archived details page found") ||
      segment.includes("archive-not-found") ||
      segment.includes(ARCHIVE_NOT_FOUND_MARKER.toLowerCase()),
  );
}

function buildAppRecord(packageId, detail, detailTimestamp) {
  if (!detail.name || !detail.publisher) {
    throw new Error(`missing required fields for ${packageId}`);
  }

  const subtitleDate =
    detail.updatedAt || toIsoDateFromTimestamp(detailTimestamp);

  const icon = sanitizeMediaUrl(detail.icon);
  const image = sanitizeMediaUrl(detail.image || detail.icon);
  const trailerImage = sanitizeMediaUrl(detail.trailerImage) || undefined;
  const screenshots = sanitizeMediaList(detail.screenshots);
  const similarIds = sanitizeRelationIds(detail.similarIds, packageId);

  return {
    id: packageId,
    name: detail.name,
    publisher: detail.publisher,
    subtitle: subtitleDate
      ? `${detail.publisher} - ${subtitleDate}`
      : detail.publisher,
    category: detail.category,
    price: detail.price || "FREE",
    color: hashToColor(packageId),
    icon,
    image,
    trailerImage,
    trailerUrl: detail.trailerUrl,
    screenshots,
    updatedAt: detail.updatedAt,
    size: detail.size,
    installs: detail.installs,
    version: detail.version,
    requiresAndroid: detail.requiresAndroid,
    contentRating: detail.contentRating,
    description: detail.description,
    whatsNew: Array.isArray(detail.whatsNew)
      ? detail.whatsNew.filter(Boolean)
      : undefined,
    ratingValue: detail.ratingValue,
    ratingCountText: detail.ratingCountText,
    reviews: detail.reviews,
    similarIds,
    moreFromDeveloperIds: [],
  };
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs);
    }),
  ]);
}

function parseRetryAfter(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed - Date.now());
}

function backoffDelay(attempt) {
  const base = 1500;
  const jitter = Math.floor(Math.random() * 700);
  return Math.min(base * 2 ** attempt + jitter, 30000);
}

class RateLimiter {
  constructor(callsPerSecond) {
    this.minIntervalMs =
      callsPerSecond > 0 ? Math.ceil(1000 / callsPerSecond) : 0;
    this.nextAt = 0;
    this.cooldownUntil = 0;
  }

  async waitTurn() {
    const now = Date.now();
    const readyAt = Math.max(now, this.cooldownUntil, this.nextAt);
    this.nextAt = readyAt + this.minIntervalMs;
    await sleep(readyAt - now);
  }

  applyCooldown(ms) {
    if (ms <= 0) return;
    const until = Date.now() + ms;
    this.cooldownUntil = Math.max(this.cooldownUntil, until);
    this.nextAt = Math.max(this.nextAt, until);
  }
}

const rateLimiters = {
  cdx: new RateLimiter(CDX_CALLS_PER_SECOND),
  page: new RateLimiter(PAGE_CALLS_PER_SECOND),
  image: new RateLimiter(IMAGE_CALLS_PER_SECOND),
};

let globalRateLimitHits = 0;

function applyGlobalArchiveCooldown(ms, reason) {
  const boundedMs = Math.max(
    DEFAULT_RATE_LIMIT_DELAY_MS,
    Math.min(ms, MAX_RATE_LIMIT_DELAY_MS),
  );
  for (const limiter of Object.values(rateLimiters)) {
    limiter.applyCooldown(boundedMs);
  }
  console.warn(
    `[cooldown] ${reason} -> pausing archive requests for ${Math.ceil(boundedMs / 1000)}s`,
  );
}

async function fetchArchive(url, label, kind, attempt = 0) {
  const limiter = rateLimiters[kind] ?? rateLimiters.page;
  await limiter.waitTurn();

  let response;
  try {
    response = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
        },
      }),
      DEFAULT_TIMEOUT_MS,
      label,
    );
  } catch (error) {
    if (attempt >= DEFAULT_RETRY_COUNT) throw error;
    await sleep(backoffDelay(attempt));
    return fetchArchive(url, label, kind, attempt + 1);
  }

  if (response.status === 429) {
    globalRateLimitHits += 1;
    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    const penaltyMs = Math.max(
      retryAfterMs,
      DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** Math.min(globalRateLimitHits - 1, 3),
    );
    applyGlobalArchiveCooldown(penaltyMs, `${label} responded with 429`);
    response.body?.cancel?.();

    if (attempt >= DEFAULT_RETRY_COUNT) {
      throw new Error(`${label} failed with 429`);
    }

    return fetchArchive(url, label, kind, attempt + 1);
  }

  if (response.ok) {
    globalRateLimitHits = 0;
    return response;
  }

  if (response.status >= 500 || response.status === 408) {
    response.body?.cancel?.();
    if (attempt >= DEFAULT_RETRY_COUNT) {
      throw new Error(`${label} failed with ${response.status}`);
    }
    await sleep(backoffDelay(attempt));
    return fetchArchive(url, label, kind, attempt + 1);
  }

  throw new Error(`${label} failed with ${response.status}`);
}

async function fetchText(url, label, kind) {
  const response = await fetchArchive(url, label, kind);
  return {
    text: await response.text(),
    finalUrl: response.url,
  };
}

async function fetchBinary(url, label, kind) {
  const response = await fetchArchive(url, label, kind);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    finalUrl: response.url,
    contentType: response.headers.get("content-type") ?? "",
  };
}

function isImageContentType(contentType) {
  return /^image\//i.test(String(contentType ?? "").trim());
}

function looksLikeHtmlDocument(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return false;
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, Math.min(bytes.length, 512)))
    .toLowerCase();
  return (
    sample.includes("<html") ||
    sample.includes("<!doctype html") ||
    sample.includes("<title>error 404") ||
    sample.includes("that’s an error") ||
    sample.includes("that's an error")
  );
}

function buildIconUrlVariants(iconUrl) {
  const variants = [];
  const seen = new Set();
  const push = (value) => {
    const normalized = sanitizeMediaUrl(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    variants.push(normalized);
  };

  push(iconUrl);

  try {
    const parsed = new URL(String(iconUrl ?? ""));
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const isGoogleImageHost =
      host.endsWith(".ggpht.com") ||
      host === "ggpht.com" ||
      host.endsWith("googleusercontent.com");
    if (isGoogleImageHost && !/=[a-z0-9_-]+$/i.test(parsed.pathname)) {
      push(`${parsed.origin}${parsed.pathname}=w124`);
    }
  } catch {}

  return variants;
}

async function fetchValidatedIconBinary(url, label) {
  const image = await fetchBinary(url, label, "image");
  if (
    !isImageContentType(image.contentType) ||
    looksLikeHtmlDocument(image.bytes)
  ) {
    throw new Error(
      `${label} resolved to non-image content-type=${image.contentType || "<empty>"} finalUrl=${image.finalUrl}`,
    );
  }
  return image;
}

function buildCdxUrl(
  url,
  year,
  fields = "timestamp,original",
  { mimetype = "text/html", collapse = "digest", limit = 0 } = {},
) {
  const params = new URLSearchParams();
  params.set("url", String(url ?? ""));
  if (Number.isInteger(year) && YEAR_RE.test(String(year))) {
    params.set("from", String(year));
    params.set("to", String(year));
  }
  params.set("output", "json");
  params.set("fl", fields);
  params.append("filter", "statuscode:200");
  if (mimetype) {
    params.append("filter", `mimetype:${mimetype}`);
  }
  if (collapse) {
    params.set("collapse", collapse);
  }
  if (Number.isFinite(limit) && Number(limit) !== 0) {
    params.set("limit", String(limit));
  }
  return `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
}

async function fetchCdxRows(url, year) {
  const response = await fetchArchive(
    buildCdxUrl(url, year),
    `cdx:${url}:${year}`,
    "cdx",
  );
  const rows = JSON.parse(await response.text());
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    timestamp: String(row[0] ?? ""),
    original: String(row[1] ?? url),
  }));
}

async function fetchCdxRowsAllYears(
  url,
  limit = DEFAULT_MEDIA_FALLBACK_PROBE_LIMIT,
) {
  const response = await fetchArchive(
    buildCdxUrl(url, undefined, "timestamp,original"),
    `cdx-all:${url}`,
    "cdx",
  );
  const rows = JSON.parse(await response.text());
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  const normalized = rows
    .slice(1)
    .map((row) => ({
      timestamp: String(row[0] ?? ""),
      original: String(row[1] ?? url),
    }))
    .filter((row) => TIMESTAMP_RE.test(row.timestamp))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  if (!Number.isFinite(limit) || Number(limit) <= 0) return normalized;
  return normalized.slice(0, Number(limit));
}

function archivePageUrl(url, timestamp) {
  return `https://web.archive.org/web/${timestamp}/${url}`;
}

function detectExtension(url, contentType) {
  const type = String(contentType).toLowerCase();
  if (type.includes("image/avif")) return ".avif";
  if (type.includes("image/png")) return ".png";
  if (type.includes("image/webp")) return ".webp";
  if (type.includes("image/gif")) return ".gif";
  if (type.includes("image/svg+xml")) return ".svg";
  if (type.includes("image/jpeg")) return ".jpg";

  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".avif")) return ".avif";
  if (pathname.endsWith(".png")) return ".png";
  if (pathname.endsWith(".webp")) return ".webp";
  if (pathname.endsWith(".gif")) return ".gif";
  if (pathname.endsWith(".svg")) return ".svg";
  if (pathname.endsWith(".jpeg")) return ".jpeg";
  if (pathname.endsWith(".jpg")) return ".jpg";
  return ".jpg";
}

async function findExistingIconPath(packageId) {
  for (const extension of [
    ".avif",
    ".png",
    ".svg",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
  ]) {
    const filePath = path.join(ICONS_DIR, `${packageId}${extension}`);
    try {
      const fileInfo = await stat(filePath);
      if (fileInfo.isFile()) return filePath;
    } catch {}
  }

  return "";
}

async function saveIconIfMissing(packageId, iconUrl, forceIcons) {
  if (!iconUrl) return { status: "missing-url" };

  await mkdir(ICONS_DIR, { recursive: true });

  const existingPath = await findExistingIconPath(packageId);
  if (existingPath && !forceIcons) {
    return { status: "skipped", filePath: existingPath };
  }

  const iconCandidates = buildIconUrlVariants(iconUrl);
  let image = null;
  const failures = [];

  for (const candidate of iconCandidates) {
    try {
      image = await fetchValidatedIconBinary(candidate, `icon:${packageId}`);
      break;
    } catch (error) {
      failures.push(`direct(${candidate}):${error?.message ?? String(error)}`);
    }
  }

  if (!image) {
    throw new Error(
      `icon fetch failed for ${packageId}: ${failures.join(" | ")}`,
    );
  }

  const extension = detectExtension(image.finalUrl, image.contentType);
  const filePath = path.join(ICONS_DIR, `${packageId}${extension}`);
  await writeFile(filePath, image.bytes);
  return { status: "saved", filePath };
}

async function resolveFirstWorkingImageUrl(
  candidates,
  label,
  validationCache = new Map(),
) {
  const seen = new Set();
  for (const raw of candidates ?? []) {
    const candidate = sanitizeMediaUrl(raw);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    let pending = validationCache.get(candidate);
    if (!pending) {
      pending = (async () => {
        const image = await fetchValidatedIconBinary(candidate, label);
        return sanitizeMediaUrl(image.finalUrl || candidate);
      })()
        .catch(() => "")
        .finally(() => {
          if (!validationCache.has(candidate)) return;
        });
      validationCache.set(candidate, pending);
    }
    const resolved = await pending;
    if (resolved) return resolved;
  }
  return "";
}

async function ensureWorkingDetailMedia(
  packageId,
  probeOrder,
  loadFieldsForTimestamp,
  detail,
) {
  const imageValidationCache = new Map();
  const fieldsByTimestamp = new Map();
  const loadFields = async (timestamp) => {
    if (fieldsByTimestamp.has(timestamp)) {
      return fieldsByTimestamp.get(timestamp);
    }
    const record = await loadFieldsForTimestamp(timestamp);
    const fields =
      record && typeof record === "object" && !record.notFound
        ? record.fields
        : null;
    fieldsByTimestamp.set(timestamp, fields);
    return fields;
  };

  let workingIcon = await resolveFirstWorkingImageUrl(
    [detail.icon, detail.image],
    `media:icon:${packageId}`,
    imageValidationCache,
  );
  if (!workingIcon) {
    for (const timestamp of probeOrder) {
      const fields = await loadFields(timestamp);
      if (!fields) continue;
      workingIcon = await resolveFirstWorkingImageUrl(
        [fields.icon, fields.image],
        `media:icon:${packageId}`,
        imageValidationCache,
      );
      if (workingIcon) break;
    }
  }
  if (workingIcon) {
    detail.icon = workingIcon;
    detail.image = workingIcon;
  } else {
    detail.icon = "";
    detail.image = "";
  }

  let workingTrailerImage = await resolveFirstWorkingImageUrl(
    [detail.trailerImage],
    `media:trailer-image:${packageId}`,
    imageValidationCache,
  );
  if (!workingTrailerImage) {
    for (const timestamp of probeOrder) {
      const fields = await loadFields(timestamp);
      if (!fields) continue;
      workingTrailerImage = await resolveFirstWorkingImageUrl(
        [fields.trailerImage],
        `media:trailer-image:${packageId}`,
        imageValidationCache,
      );
      if (workingTrailerImage) break;
    }
  }
  detail.trailerImage = workingTrailerImage || "";

  const workingScreenshots = [];
  const used = new Set();
  const collectScreenshots = async (candidates) => {
    for (const candidate of candidates ?? []) {
      const resolved = await resolveFirstWorkingImageUrl(
        [candidate],
        `media:screenshot:${packageId}`,
        imageValidationCache,
      );
      if (!resolved || used.has(resolved)) continue;
      used.add(resolved);
      workingScreenshots.push(resolved);
      if (workingScreenshots.length >= 8) return true;
    }
    return false;
  };

  await collectScreenshots(
    Array.isArray(detail.screenshots) ? detail.screenshots : [],
  );

  if (workingScreenshots.length < 8) {
    for (const timestamp of probeOrder) {
      const fields = await loadFields(timestamp);
      if (!fields) continue;
      const done = await collectScreenshots(
        Array.isArray(fields.screenshots) ? fields.screenshots : [],
      );
      if (done) break;
    }
  }

  detail.screenshots = workingScreenshots;
}

function chooseNearestTimestamp(rows, preferredTimestamp) {
  if (rows.length === 0) return "";
  if (!TIMESTAMP_RE.test(String(preferredTimestamp))) return rows[0].timestamp;

  const preferred = Number.parseInt(preferredTimestamp, 10);
  return [...rows].sort((left, right) => {
    const leftDelta = Math.abs(Number.parseInt(left.timestamp, 10) - preferred);
    const rightDelta = Math.abs(
      Number.parseInt(right.timestamp, 10) - preferred,
    );
    return (
      leftDelta - rightDelta || left.timestamp.localeCompare(right.timestamp)
    );
  })[0].timestamp;
}

function chooseNewestTimestamp(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  return [...rows].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  )[0].timestamp;
}

function isBlankText(value) {
  return !cleanText(value);
}

function hasMediaGaps(detail) {
  const screenshots = Array.isArray(detail?.screenshots)
    ? detail.screenshots
    : [];
  return (
    isBlankText(detail?.icon) ||
    isBlankText(detail?.image) ||
    screenshots.length === 0
  );
}

function fillMissingMedia(baseDetail, candidateDetail) {
  if (isBlankText(baseDetail.icon) && !isBlankText(candidateDetail.icon)) {
    baseDetail.icon = candidateDetail.icon;
  }
  if (isBlankText(baseDetail.image) && !isBlankText(candidateDetail.image)) {
    baseDetail.image = candidateDetail.image;
  }
  if (
    isBlankText(baseDetail.trailerImage) &&
    !isBlankText(candidateDetail.trailerImage)
  ) {
    baseDetail.trailerImage = candidateDetail.trailerImage;
  }
  if (
    isBlankText(baseDetail.trailerUrl) &&
    !isBlankText(candidateDetail.trailerUrl)
  ) {
    baseDetail.trailerUrl = candidateDetail.trailerUrl;
  }

  const mergedScreenshots = [];
  const seen = new Set();
  for (const url of [
    ...(Array.isArray(baseDetail.screenshots) ? baseDetail.screenshots : []),
    ...(Array.isArray(candidateDetail.screenshots)
      ? candidateDetail.screenshots
      : []),
  ]) {
    const normalized = normalizeArchiveMediaUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    mergedScreenshots.push(normalized);
    if (mergedScreenshots.length >= 8) break;
  }
  baseDetail.screenshots = mergedScreenshots;
}

function mergeDetailRelations(
  baseDetail,
  candidateDetail,
  currentPackageId = "",
) {
  const mergedSimilarIds = sanitizeRelationIds(
    [
      ...(Array.isArray(baseDetail?.similarIds) ? baseDetail.similarIds : []),
      ...(Array.isArray(candidateDetail?.similarIds)
        ? candidateDetail.similarIds
        : []),
    ],
    currentPackageId,
  );
  if (mergedSimilarIds.length > 0) {
    baseDetail.similarIds = mergedSimilarIds;
  }
}

function applyLatestMetrics(baseDetail, latestDetail) {
  if (!isBlankText(latestDetail.installs)) {
    baseDetail.installs = latestDetail.installs;
  }
  if (
    !Number.isNaN(latestDetail.ratingValue) &&
    Number.isFinite(latestDetail.ratingValue)
  ) {
    baseDetail.ratingValue = latestDetail.ratingValue;
  }
  if (Number.isFinite(latestDetail.reviews) && latestDetail.reviews > 0) {
    baseDetail.reviews = latestDetail.reviews;
    baseDetail.ratingCountText = formatCountText(latestDetail.reviews);
  } else if (!isBlankText(latestDetail.ratingCountText)) {
    baseDetail.ratingCountText = latestDetail.ratingCountText;
  }
}

function buildProbeOrder(
  rows,
  preferredTimestamp,
  maxItems = DEFAULT_DETAIL_PROBE_LIMIT,
) {
  const limit = toPositiveInt(maxItems, DEFAULT_DETAIL_PROBE_LIMIT);
  const nearestRows = [...rows].sort((left, right) => {
    if (!TIMESTAMP_RE.test(String(preferredTimestamp))) {
      return right.timestamp.localeCompare(left.timestamp);
    }

    const preferred = Number.parseInt(preferredTimestamp, 10);
    const leftDelta = Math.abs(Number.parseInt(left.timestamp, 10) - preferred);
    const rightDelta = Math.abs(
      Number.parseInt(right.timestamp, 10) - preferred,
    );
    return (
      leftDelta - rightDelta || left.timestamp.localeCompare(right.timestamp)
    );
  });
  const newestRows = [...rows].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );
  const oldestRows = [...rows].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
  const ordered = [];
  const seen = new Set();
  const pushTs = (ts) => {
    if (!ts || seen.has(ts) || ordered.length >= limit) return;
    seen.add(ts);
    ordered.push(ts);
  };

  pushTs(nearestRows[0]?.timestamp ?? "");
  pushTs(newestRows[0]?.timestamp ?? "");
  pushTs(oldestRows[0]?.timestamp ?? "");

  for (const row of nearestRows) pushTs(row.timestamp);
  for (const row of newestRows) pushTs(row.timestamp);
  return ordered;
}

async function collectSourcePackages(year, pageLimit) {
  const seen = new Map();
  const summary = [];

  for (const sourceUrl of SOURCE_PAGES) {
    let rows;
    try {
      rows = await fetchCdxRows(sourceUrl, year);
    } catch (error) {
      logArchiveSync(
        "discover:source:skip",
        `year=${year} source=${sourceUrl} error=${error?.message ?? String(error)}`,
      );
      continue;
    }
    const scopedRows = pageLimit > 0 ? rows.slice(0, pageLimit) : rows;
    console.log(
      `[discover] source=${sourceUrl} snapshots=${scopedRows.length}/${rows.length}`,
    );

    for (const row of scopedRows) {
      const page = await fetchText(
        archivePageUrl(sourceUrl, row.timestamp),
        `source:${sourceUrl}:${row.timestamp}`,
        "page",
      );
      const finalTimestamp =
        extractWaybackTimestamp(page.finalUrl) || row.timestamp;
      const packageIds = extractPagePackageIds(page.text);

      summary.push({
        sourceUrl,
        timestamp: finalTimestamp,
        packages: packageIds.length,
      });

      for (const packageId of packageIds) {
        if (seen.has(packageId)) continue;
        seen.set(packageId, {
          packageId,
          sourceUrl,
          sourceTimestamp: finalTimestamp,
        });
      }
    }
  }

  return { packages: [...seen.values()], summary };
}

function buildManualCandidates(packageIds, year) {
  return packageIds.map((packageId) => ({
    packageId,
    sourceUrl: "manual",
    sourceTimestamp: `${year}0101000000`,
    firstSeenYear: year,
    lastSeenYear: year,
  }));
}

async function collectSourcePackagesInRange(years, pageLimit) {
  const byPackageId = new Map();
  const byYear = [];

  for (const year of years) {
    const result = await collectSourcePackages(year, pageLimit);
    byYear.push({
      year,
      discovered: result.packages.length,
      snapshots: result.summary.length,
    });

    for (const item of result.packages) {
      const existing = byPackageId.get(item.packageId);
      if (!existing) {
        byPackageId.set(item.packageId, {
          ...item,
          firstSeenYear: year,
          lastSeenYear: year,
        });
        continue;
      }

      existing.lastSeenYear = year;
      if (
        String(item.sourceTimestamp ?? "") <
        String(existing.sourceTimestamp ?? "")
      ) {
        existing.sourceTimestamp = item.sourceTimestamp;
        existing.sourceUrl = item.sourceUrl;
      }
    }
  }

  return {
    packages: [...byPackageId.values()],
    byYear,
  };
}

async function collectSourcePackagesStreaming(
  year,
  pageLimit,
  snapshotConcurrency,
  onCandidate,
  shouldStop = () => false,
) {
  const seen = new Set();
  const summary = [];

  for (const sourceUrl of SOURCE_PAGES) {
    if (shouldStop()) break;

    let rows;
    try {
      rows = await fetchCdxRows(sourceUrl, year);
    } catch (error) {
      logArchiveSync(
        "discover:source:skip",
        `year=${year} source=${sourceUrl} error=${error?.message ?? String(error)}`,
      );
      continue;
    }
    const scopedRows = pageLimit > 0 ? rows.slice(0, pageLimit) : rows;
    logArchiveSync(
      "discover:source",
      `year=${year} source=${sourceUrl} snapshots=${scopedRows.length}/${rows.length}`,
    );

    const rowChunks = splitIntoChunks(
      scopedRows,
      Math.max(1, snapshotConcurrency),
    );
    for (const chunk of rowChunks) {
      if (shouldStop()) break;

      const chunkResults = await Promise.all(
        chunk.map(async (row) => {
          try {
            const page = await fetchText(
              archivePageUrl(sourceUrl, row.timestamp),
              `source:${sourceUrl}:${row.timestamp}`,
              "page",
            );
            const finalTimestamp =
              extractWaybackTimestamp(page.finalUrl) || row.timestamp;
            const packageIds = extractPagePackageIds(page.text);
            return {
              row,
              finalTimestamp,
              packageIds,
            };
          } catch (error) {
            logArchiveSync(
              "discover:page:fail",
              `year=${year} source=${sourceUrl} timestamp=${row.timestamp} error=${error?.message ?? String(error)}`,
            );
            return null;
          }
        }),
      );

      for (const pageResult of chunkResults) {
        if (shouldStop()) break;
        if (!pageResult) continue;

        summary.push({
          sourceUrl,
          timestamp: pageResult.finalTimestamp,
          packages: pageResult.packageIds.length,
        });

        for (const packageId of pageResult.packageIds) {
          if (shouldStop()) break;
          if (seen.has(packageId)) continue;
          seen.add(packageId);
          await onCandidate({
            packageId,
            sourceUrl,
            sourceTimestamp: pageResult.finalTimestamp,
            firstSeenYear: year,
            lastSeenYear: year,
          });
        }
      }
    }
  }

  return { discovered: seen.size, snapshots: summary.length, summary };
}

function splitIntoChunks(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function runCommand(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "inherit",
      shell: false,
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${options.label} exited with code ${code ?? "unknown"}`),
      );
    });
  });
}

function resolveIconYearForCandidate(candidate, options) {
  if (
    Number.isInteger(options.iconYear) &&
    options.iconYear >= MIN_ARCHIVE_YEAR
  ) {
    return options.iconYear;
  }
  return Number(candidate.firstSeenYear) || MIN_ARCHIVE_YEAR;
}

async function runArchiveIconSync(packageCandidates, options) {
  if (options.skipIcons) {
    console.log("[archive-sync] icon sync skipped (--skip-icons)");
    return;
  }

  if (packageCandidates.length === 0) return;

  const chunkSize = toPositiveInt(
    options.iconChunkSize,
    DEFAULT_ICON_CHUNK_SIZE,
  );

  const byYear = new Map();
  for (const candidate of packageCandidates) {
    const year = resolveIconYearForCandidate(candidate, options);
    if (
      !Number.isInteger(year) ||
      year < MIN_ARCHIVE_YEAR ||
      year > CURRENT_YEAR
    ) {
      console.warn(
        `[archive-sync] icon year skipped for ${candidate.packageId}: invalid year ${year}`,
      );
      continue;
    }
    const list = byYear.get(year) ?? [];
    list.push(candidate.packageId);
    byYear.set(year, list);
  }

  if (byYear.size === 0) {
    console.warn(
      "[archive-sync] icon sync skipped: no valid package/year pairs",
    );
    return;
  }

  const years = [...byYear.keys()].sort((left, right) => left - right);
  for (const year of years) {
    const packageIds = byYear.get(year) ?? [];
    const chunks = splitIntoChunks(packageIds, chunkSize);
    console.log(
      `[archive-sync] icon-sync year=${year} packages=${packageIds.length} chunks=${chunks.length} chunkSize=${chunkSize} force=${options.forceIcons}`,
    );

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const args = [
        "scripts/download-archive-icons.mjs",
        `--year=${year}`,
        `--packages=${chunk.join(",")}`,
      ];
      if (options.forceIcons) args.push("--force");

      try {
        await runCommand("bun", args, {
          cwd: process.cwd(),
          label: `download-archive-icons year=${year} chunk ${index + 1}/${chunks.length}`,
        });
      } catch (error) {
        console.warn(
          `[archive-sync] icon chunk failed year=${year} ${index + 1}/${chunks.length}: ${error?.message ?? String(error)}`,
        );
      }
    }
  }
}

function formatItemRef(order, total = 0) {
  return total > 0 ? `${order}/${total}` : String(order);
}

function createImportSummary(requested = 0) {
  return {
    requested,
    added: 0,
    updated: 0,
    failed: 0,
    crashed: 0,
    fallbackAdded: 0,
    fallbackFailed: 0,
    total: 0,
  };
}

function buildFallbackYears(candidate, years) {
  const normalizedYears = years.filter(
    (year) =>
      Number.isInteger(year) &&
      year >= MIN_ARCHIVE_YEAR &&
      year <= CURRENT_YEAR,
  );
  if (normalizedYears.length === 0) return [];

  const firstSeenYear = Number.parseInt(
    String(candidate.firstSeenYear ?? ""),
    10,
  );
  if (!Number.isInteger(firstSeenYear)) return normalizedYears;

  const scoped = normalizedYears.filter((year) => year >= firstSeenYear);
  return scoped.length > 0 ? scoped : normalizedYears;
}

async function persistArchiveFallbackApp(candidate, detailRecord, year) {
  const loaded = await loadAppsFile(APPS_FILE);
  const existingIndex = loaded.apps.findIndex(
    (app) => String(app?.id ?? "").trim() === candidate.packageId,
  );

  if (existingIndex >= 0) {
    const existing = loaded.apps[existingIndex];
    const incoming = detailRecord.app ?? {};
    const nextApp = { ...existing };
    let changed = false;

    const setIfChanged = (key, value) => {
      if (value === undefined) return;
      const prev = JSON.stringify(nextApp[key] ?? null);
      const next = JSON.stringify(value ?? null);
      if (prev === next) return;
      nextApp[key] = value;
      changed = true;
    };

    const incomingIcon = sanitizeMediaUrl(incoming.icon);
    const incomingImage = sanitizeMediaUrl(incoming.image) || incomingIcon;
    const incomingTrailerImage = sanitizeMediaUrl(incoming.trailerImage);
    const incomingTrailerUrl = String(incoming.trailerUrl ?? "").trim();
    const incomingContentRating = extractLeadingText(incoming.contentRating);
    const incomingName = sanitizeLocaleText(incoming.name);
    const incomingPublisher = sanitizeLocaleText(incoming.publisher);
    const incomingPrice = isBlankText(incoming.price)
      ? ""
      : normalizeUsdPrice("", incoming.price);
    const incomingUpdatedAt = cleanText(incoming.updatedAt);
    const incomingSize = sanitizeLocaleText(incoming.size);
    const incomingInstalls = sanitizeLocaleText(incoming.installs);
    const incomingVersion = sanitizeLocaleText(incoming.version);
    const incomingRequiresAndroid = sanitizeLocaleText(
      incoming.requiresAndroid,
    );
    const incomingDescription = sanitizeLocaleBlocks(incoming.description);
    const incomingWhatsNew = sanitizeLocaleBlocks(incoming.whatsNew);
    const incomingRatingCountText = cleanText(incoming.ratingCountText);
    const incomingScreenshots = sanitizeMediaList(
      Array.isArray(incoming.screenshots) ? incoming.screenshots : [],
    );
    const incomingSimilarIds = sanitizeRelationIds(
      incoming.similarIds,
      candidate.packageId,
    );

    if (!isBlankText(incomingName)) setIfChanged("name", incomingName);
    if (!isBlankText(incomingPublisher))
      setIfChanged("publisher", incomingPublisher);
    if (!isBlankText(incomingPrice)) setIfChanged("price", incomingPrice);
    if (!isBlankText(incomingUpdatedAt))
      setIfChanged("updatedAt", incomingUpdatedAt);
    if (!isBlankText(incomingSize)) setIfChanged("size", incomingSize);
    if (!isBlankText(incomingInstalls))
      setIfChanged("installs", incomingInstalls);
    if (!isBlankText(incomingVersion)) setIfChanged("version", incomingVersion);
    if (!isBlankText(incomingRequiresAndroid)) {
      setIfChanged("requiresAndroid", incomingRequiresAndroid);
    }
    if (incomingDescription.length > 0) {
      setIfChanged("description", incomingDescription);
    }
    if (incomingWhatsNew.length > 0) {
      setIfChanged("whatsNew", incomingWhatsNew);
    }
    if (
      Number.isFinite(incoming.ratingValue) &&
      !Number.isNaN(incoming.ratingValue)
    ) {
      setIfChanged("ratingValue", incoming.ratingValue);
    }
    if (!isBlankText(incomingRatingCountText)) {
      setIfChanged("ratingCountText", incomingRatingCountText);
    }
    if (Number.isFinite(incoming.reviews) && incoming.reviews > 0) {
      setIfChanged("reviews", incoming.reviews);
    }

    if (incomingIcon) setIfChanged("icon", incomingIcon);
    if (incomingImage) setIfChanged("image", incomingImage);
    if (
      isBlankText(nextApp.image) &&
      !isBlankText(nextApp.icon) &&
      nextApp.image !== nextApp.icon
    ) {
      setIfChanged("image", nextApp.icon);
    }
    if (incomingTrailerImage)
      setIfChanged("trailerImage", incomingTrailerImage);
    if (!isBlankText(incomingTrailerUrl)) {
      setIfChanged("trailerUrl", incomingTrailerUrl);
    }
    if (!isBlankText(incomingContentRating)) {
      setIfChanged("contentRating", incomingContentRating);
    }
    if (incomingScreenshots.length > 0) {
      setIfChanged("screenshots", incomingScreenshots);
    }
    if (incomingSimilarIds.length > 0) {
      setIfChanged("similarIds", incomingSimilarIds);
    }

    if (!changed) {
      return {
        action: "exists",
        total: loaded.apps.length,
      };
    }

    const nextApps = [...loaded.apps];
    nextApps[existingIndex] = nextApp;
    await writeFile(APPS_FILE, serializeApps(nextApps), "utf8");

    return {
      action: "updated",
      year,
      total: nextApps.length,
      detailTimestamp: detailRecord.timestamp,
      pageUrl: detailRecord.pageUrl,
    };
  }

  if (loaded.byId.has(candidate.packageId)) {
    return {
      action: "exists",
      total: loaded.apps.length,
    };
  }

  const nextApps = [...loaded.apps, detailRecord.app];
  await writeFile(APPS_FILE, serializeApps(nextApps), "utf8");

  return {
    action: "added",
    year,
    total: nextApps.length,
    detailTimestamp: detailRecord.timestamp,
    pageUrl: detailRecord.pageUrl,
  };
}

async function importCandidateFromArchiveFallback(
  candidate,
  order,
  total,
  years,
) {
  const itemRef = formatItemRef(order, total);
  const fallbackYears = buildFallbackYears(candidate, years);
  if (fallbackYears.length === 0) {
    return { status: "failed", details: "no fallback years available" };
  }

  const preferredTimestamp = String(candidate.sourceTimestamp ?? "");
  logArchiveSync(
    "fallback:start",
    `item=${itemRef} id=${candidate.packageId} years=${fallbackYears.join(",")} preferredTs=${preferredTimestamp || "<none>"}`,
  );

  const failures = [];

  for (const year of fallbackYears) {
    const stepStartedAt = Date.now();
    try {
      logArchiveSync(
        "fallback:try",
        `item=${itemRef} id=${candidate.packageId} year=${year}`,
      );

      const detailRecord = await withTimeout(
        fetchDetailRecord(candidate.packageId, preferredTimestamp, year),
        DEFAULT_FALLBACK_STEP_TIMEOUT_MS,
        `fallback:${candidate.packageId}:${year}`,
      );
      const persisted = await persistArchiveFallbackApp(
        candidate,
        detailRecord,
        year,
      );

      if (persisted.action === "exists") {
        logArchiveSync(
          "fallback:exists",
          `item=${itemRef} id=${candidate.packageId} year=${year} elapsedMs=${elapsedMs(stepStartedAt)}`,
        );
        return {
          status: "exists",
          year,
          total: persisted.total,
        };
      }

      if (persisted.action === "updated") {
        logArchiveSync(
          "fallback:updated",
          `item=${itemRef} id=${candidate.packageId} year=${year} detailTs=${persisted.detailTimestamp} total=${persisted.total} elapsedMs=${elapsedMs(stepStartedAt)}`,
        );
        return {
          status: "updated",
          year,
          total: persisted.total,
          detailTimestamp: persisted.detailTimestamp,
          pageUrl: persisted.pageUrl,
        };
      }

      logArchiveSync(
        "fallback:added",
        `item=${itemRef} id=${candidate.packageId} year=${year} detailTs=${persisted.detailTimestamp} total=${persisted.total} elapsedMs=${elapsedMs(stepStartedAt)}`,
      );
      return {
        status: "added",
        year,
        total: persisted.total,
        detailTimestamp: persisted.detailTimestamp,
        pageUrl: persisted.pageUrl,
      };
    } catch (error) {
      const message = error?.message ?? String(error);
      const reason = message.includes(ARCHIVE_NOT_FOUND_MARKER)
        ? "archive-not-found"
        : "fallback-miss";
      failures.push(`${year}:${message}`);
      logArchiveSync(
        "fallback:skip",
        `item=${itemRef} id=${candidate.packageId} year=${year} reason=${reason} error=${message} elapsedMs=${elapsedMs(stepStartedAt)}`,
      );
    }
  }

  return {
    status: "skipped",
    details: failures.join(" | "),
  };
}

function logImportEvent(candidate, order, total, event) {
  const type = String(event?.type ?? "");
  const payload = event?.payload ?? {};
  const prefix = `item=${formatItemRef(order, total)} id=${candidate.packageId}`;

  if (type === "start") {
    logArchiveSync(
      "import:event:start",
      `${prefix} mode=${payload.mode ?? "unknown"} country=${payload.country ?? "unknown"} lang=${payload.lang ?? "unknown"}`,
    );
    return;
  }

  if (type === "existing") {
    logArchiveSync(
      "import:event:existing",
      `${prefix} existing=${Number(payload.count ?? 0)}`,
    );
    return;
  }

  if (type === "queue") {
    logArchiveSync(
      "import:event:queue",
      `${prefix} queued=${Number(payload.queued ?? 0)} candidates=${Number(payload.candidates ?? 0)}`,
    );
    return;
  }

  if (type === "item_result") {
    logArchiveSync(
      "import:event:item_result",
      `${prefix} action=${payload.action ?? "unknown"} addedDelta=${Number(payload.addedDelta ?? 0)} updatedDelta=${Number(payload.updatedDelta ?? 0)} failed=${payload.action === "failed"} remaining=${Number(payload.remaining ?? 0)}`,
    );
    return;
  }

  if (type === "persist") {
    logArchiveSync(
      "import:event:persist",
      `${prefix} currentTotal=${Number(payload.currentTotal ?? 0)} processed=${Number(payload.processed ?? 0)}`,
    );
    return;
  }

  if (type === "progress") {
    logArchiveSync(
      "import:event:progress",
      `${prefix} processed=${Number(payload.processed ?? 0)}/${Number(payload.total ?? 0)} percent=${Number(payload.percent ?? 0)} remaining=${Number(payload.remaining ?? 0)}`,
    );
    return;
  }

  if (type === "done") {
    logArchiveSync(
      "import:event:done",
      `${prefix} total=${Number(payload.total ?? 0)}`,
    );
    return;
  }

  if (type === "error") {
    logArchiveSync(
      "import:event:error",
      `${prefix} message=${payload.message ?? "unknown"}`,
    );
  }
}

async function importSingleCandidate(
  candidate,
  order,
  total,
  summary,
  years,
  missingApps,
) {
  const itemStartedAt = Date.now();
  const itemRef = formatItemRef(order, total);

  logArchiveSync(
    "import:start",
    `item=${itemRef} id=${candidate.packageId} firstSeenYear=${candidate.firstSeenYear} source=${candidate.sourceUrl} sourceTs=${candidate.sourceTimestamp}`,
  );

  try {
    const result = await runSyncPackages([candidate.packageId], {
      persistEvery: 1,
      onEvent: (event) => logImportEvent(candidate, order, total, event),
    });

    const itemAdded = Number(result?.stats?.merge?.added ?? 0);
    const itemUpdated = Number(result?.stats?.merge?.updated ?? 0);
    const itemFailed = Number(result?.stats?.details?.failed ?? 0);

    summary.added += itemAdded;
    summary.updated += itemUpdated;
    summary.failed += itemFailed;
    summary.total = Number(result?.total ?? summary.total);

    if (itemAdded > 0 || itemUpdated > 0) {
      await unmarkMissingApp(
        candidate.packageId,
        itemAdded > 0 ? "import-added" : "import-updated",
        missingApps,
      );
    }

    let action =
      itemFailed > 0
        ? "failed"
        : itemAdded > 0
          ? "added"
          : itemUpdated > 0
            ? "updated"
            : "skipped";
    let fallbackStatus = "none";

    if (itemFailed > 0) {
      const fallback = await importCandidateFromArchiveFallback(
        candidate,
        order,
        total,
        years,
      );
      fallbackStatus = fallback.status;

      if (fallback.status === "added") {
        summary.fallbackAdded += 1;
        summary.failed = Math.max(0, summary.failed - itemFailed);
        summary.total = Number(fallback.total ?? summary.total);
        await unmarkMissingApp(
          candidate.packageId,
          "fallback-added",
          missingApps,
        );
        action = "fallback-added";
      } else if (fallback.status === "updated") {
        summary.updated += 1;
        summary.failed = Math.max(0, summary.failed - itemFailed);
        summary.total = Number(fallback.total ?? summary.total);
        await unmarkMissingApp(
          candidate.packageId,
          "fallback-updated",
          missingApps,
        );
        action = "fallback-updated";
      } else if (fallback.status === "exists") {
        summary.failed = Math.max(0, summary.failed - itemFailed);
        summary.total = Number(fallback.total ?? summary.total);
        await unmarkMissingApp(
          candidate.packageId,
          "fallback-exists",
          missingApps,
        );
        action = "fallback-exists";
      } else if (fallback.status === "skipped") {
        action = "fallback-skipped";
        if (shouldPersistMissingApp(fallback.details)) {
          await markMissingApp(
            candidate.packageId,
            `fallback-skipped:${fallback.details ?? "unknown"}`,
            missingApps,
          );
        } else {
          logArchiveSync(
            "missing:skip-transient",
            `id=${candidate.packageId} reason=fallback-skipped:${fallback.details ?? "unknown"}`,
          );
        }
      } else {
        summary.fallbackFailed += 1;
        if (shouldPersistMissingApp(fallback.details)) {
          await markMissingApp(
            candidate.packageId,
            `fallback-failed:${fallback.details ?? "unknown"}`,
            missingApps,
          );
        } else {
          logArchiveSync(
            "missing:skip-transient",
            `id=${candidate.packageId} reason=fallback-failed:${fallback.details ?? "unknown"}`,
          );
        }
        logArchiveSync(
          "fallback:failed",
          `item=${itemRef} id=${candidate.packageId} details=${fallback.details ?? "<none>"}`,
        );
      }
    }

    logArchiveSync(
      "import:done",
      `item=${itemRef} id=${candidate.packageId} action=${action} added=${itemAdded} updated=${itemUpdated} failed=${itemFailed} fallback=${fallbackStatus} elapsedMs=${elapsedMs(itemStartedAt)}`,
    );
  } catch (error) {
    summary.crashed += 1;
    const crashReason = `import-crash:${error?.message ?? String(error)}`;
    if (shouldPersistMissingApp(crashReason)) {
      await markMissingApp(candidate.packageId, crashReason, missingApps);
    } else {
      logArchiveSync(
        "missing:skip-transient",
        `id=${candidate.packageId} reason=${crashReason}`,
      );
    }
    logArchiveSync(
      "import:crash",
      `item=${itemRef} id=${candidate.packageId} error=${error?.message ?? String(error)} elapsedMs=${elapsedMs(itemStartedAt)}`,
    );
  }
}

async function importPackagesGradually(candidates, years, missingApps) {
  const startedAt = Date.now();
  const summary = createImportSummary(candidates.length);

  for (let index = 0; index < candidates.length; index += 1) {
    await importSingleCandidate(
      candidates[index],
      index + 1,
      candidates.length,
      summary,
      years,
      missingApps,
    );
  }

  logArchiveSync(
    "import:summary",
    `requested=${summary.requested} added=${summary.added} fallbackAdded=${summary.fallbackAdded} updated=${summary.updated} failed=${summary.failed} fallbackFailed=${summary.fallbackFailed} crashed=${summary.crashed} total=${summary.total} elapsedMs=${elapsedMs(startedAt)}`,
  );

  return summary;
}

async function fetchDetailRecord(packageId, preferredTimestamp, year) {
  const detailsUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}`;
  const rows = await fetchCdxRows(detailsUrl, year);
  const probeOrder = buildProbeOrder(rows, preferredTimestamp);
  const chosenTimestamp = probeOrder[0] ?? "";
  const newestTimestamp = chooseNewestTimestamp(rows);
  let newestGlobalTimestamp = "";
  try {
    const newestGlobalRows = await fetchCdxRowsAllYears(detailsUrl, 1);
    newestGlobalTimestamp = String(newestGlobalRows[0]?.timestamp ?? "");
  } catch (error) {
    logArchiveSync(
      "snapshot:latest-skip",
      `id=${packageId} year=${year} error=${error?.message ?? String(error)}`,
    );
  }

  if (!chosenTimestamp) {
    throw new Error(
      `no archived details page found for ${packageId} in ${year}`,
    );
  }

  const fieldCache = new Map();
  const loadFieldsForTimestamp = async (timestamp) => {
    if (fieldCache.has(timestamp)) return fieldCache.get(timestamp);
    const page = await fetchText(
      archivePageUrl(detailsUrl, timestamp),
      `details:${packageId}:${timestamp}`,
      "page",
    );
    const detailTimestamp = extractWaybackTimestamp(page.finalUrl) || timestamp;
    const notFound = isArchiveNotFoundPage(page.text);
    const fields = extractDetailFields(page.text, detailTimestamp, packageId);
    const record = {
      timestamp: detailTimestamp,
      pageUrl: page.finalUrl,
      notFound,
      fields,
    };
    fieldCache.set(timestamp, record);
    return record;
  };

  const baseRecord = await loadFieldsForTimestamp(chosenTimestamp);
  if (baseRecord.notFound) {
    throw new Error(
      `${ARCHIVE_NOT_FOUND_MARKER} package=${packageId} ts=${chosenTimestamp}`,
    );
  }

  let preferredRecord = baseRecord;
  let preferredLocaleScore = scoreDetailLocale(baseRecord.fields);
  for (const timestamp of probeOrder) {
    if (timestamp === chosenTimestamp) continue;
    const record = await loadFieldsForTimestamp(timestamp);
    if (record.notFound) continue;
    const score = scoreDetailLocale(record.fields);
    if (score > preferredLocaleScore) {
      preferredRecord = record;
      preferredLocaleScore = score;
    }
  }
  if (preferredRecord.timestamp !== baseRecord.timestamp) {
    logArchiveSync(
      "locale:prefer",
      `id=${packageId} year=${year} from=${baseRecord.timestamp} to=${preferredRecord.timestamp} score=${preferredLocaleScore.toFixed(2)}`,
    );
  }

  const mergedFields = { ...preferredRecord.fields };
  applyLocaleSafeTextFields(mergedFields, preferredRecord.fields);
  let recordForOutput = preferredRecord;
  let mediaProbeOrder = [...probeOrder];

  if (
    TIMESTAMP_RE.test(newestGlobalTimestamp) &&
    !mediaProbeOrder.includes(newestGlobalTimestamp)
  ) {
    mediaProbeOrder = [newestGlobalTimestamp, ...mediaProbeOrder];
  }

  if (newestTimestamp) {
    const newestRecord = await loadFieldsForTimestamp(newestTimestamp);
    if (!newestRecord.notFound) {
      applyLatestMetrics(mergedFields, newestRecord.fields);
    }
  }

  if (TIMESTAMP_RE.test(newestGlobalTimestamp)) {
    const newestGlobalRecord = await loadFieldsForTimestamp(
      newestGlobalTimestamp,
    );
    if (!newestGlobalRecord.notFound) {
      applyLatestMetrics(mergedFields, newestGlobalRecord.fields);
      applyLocaleSafeTextFields(mergedFields, newestGlobalRecord.fields);
      fillMissingMedia(mergedFields, newestGlobalRecord.fields);
      recordForOutput = newestGlobalRecord;
      const globalScore = scoreDetailLocale(newestGlobalRecord.fields);
      if (globalScore > preferredLocaleScore) {
        preferredLocaleScore = globalScore;
        preferredRecord = newestGlobalRecord;
      }
      logArchiveSync(
        "snapshot:latest",
        `id=${packageId} year=${year} ts=${newestGlobalRecord.timestamp}`,
      );
    }
  }

  if (hasMediaGaps(mergedFields)) {
    for (const timestamp of mediaProbeOrder) {
      const record = await loadFieldsForTimestamp(timestamp);
      if (record.notFound) continue;
      fillMissingMedia(mergedFields, record.fields);
      if (!hasMediaGaps(mergedFields)) break;
    }
  }

  if (isBlankText(mergedFields.image) && !isBlankText(mergedFields.icon)) {
    mergedFields.image = mergedFields.icon;
  }
  for (const record of fieldCache.values()) {
    if (!record || record.notFound) continue;
    mergeDetailRelations(mergedFields, record.fields, packageId);
  }

  const runMediaValidation = async (order, stage) => {
    try {
      await withTimeout(
        ensureWorkingDetailMedia(
          packageId,
          order,
          loadFieldsForTimestamp,
          mergedFields,
        ),
        DEFAULT_MEDIA_VALIDATE_TIMEOUT_MS,
        `detail-media:${packageId}:${year}:${stage}`,
      );
      return true;
    } catch (error) {
      logArchiveSync(
        "media:skip",
        `id=${packageId} year=${year} stage=${stage} error=${error?.message ?? String(error)}`,
      );
      return false;
    }
  };

  let mediaValidated = await runMediaValidation(mediaProbeOrder, "primary");

  const localeNeedsExpansion = detailHasDisallowedLocale(mergedFields);
  if (!mediaValidated || hasMediaGaps(mergedFields) || localeNeedsExpansion) {
    try {
      const fallbackRows = await fetchCdxRowsAllYears(
        detailsUrl,
        DEFAULT_MEDIA_FALLBACK_PROBE_LIMIT * 2,
      );
      const existing = new Set(mediaProbeOrder);
      const extraTimestamps = [];
      for (const row of fallbackRows) {
        const timestamp = String(row?.timestamp ?? "");
        if (!TIMESTAMP_RE.test(timestamp) || existing.has(timestamp)) continue;
        existing.add(timestamp);
        extraTimestamps.push(timestamp);
        if (extraTimestamps.length >= DEFAULT_MEDIA_FALLBACK_PROBE_LIMIT) break;
      }

      if (extraTimestamps.length > 0) {
        mediaProbeOrder = [...mediaProbeOrder, ...extraTimestamps];
        logArchiveSync(
          "media:expand",
          `id=${packageId} year=${year} added=${extraTimestamps.length} total=${mediaProbeOrder.length}`,
        );

        let localeImproved = false;
        for (const timestamp of extraTimestamps) {
          const record = await loadFieldsForTimestamp(timestamp);
          if (record.notFound) continue;

          const score = scoreDetailLocale(record.fields);
          if (score > preferredLocaleScore) {
            preferredLocaleScore = score;
            preferredRecord = record;
            recordForOutput = record;
            applyLocaleSafeTextFields(mergedFields, record.fields);
            localeImproved = true;
          }

          if (hasMediaGaps(mergedFields)) {
            fillMissingMedia(mergedFields, record.fields);
          }
        }
        if (localeImproved) {
          logArchiveSync(
            "locale:expand",
            `id=${packageId} year=${year} ts=${preferredRecord.timestamp} score=${preferredLocaleScore.toFixed(2)}`,
          );
        }

        const fallbackValidated = await runMediaValidation(
          mediaProbeOrder,
          "fallback",
        );
        mediaValidated = mediaValidated || fallbackValidated;
      }
    } catch (error) {
      logArchiveSync(
        "media:expand-skip",
        `id=${packageId} year=${year} error=${error?.message ?? String(error)}`,
      );
    }
  }

  const localeSafeFields = sanitizeDetailLocaleFields(mergedFields);
  if (isBlankText(localeSafeFields.name)) {
    localeSafeFields.name = sanitizeLocaleText(mergedFields.name);
  }
  if (isBlankText(localeSafeFields.publisher)) {
    localeSafeFields.publisher = sanitizeLocaleText(mergedFields.publisher);
  }
  const latestSnapshotTimestamp = [...fieldCache.values()]
    .filter(
      (record) =>
        record &&
        !record.notFound &&
        TIMESTAMP_RE.test(String(record.timestamp ?? "")),
    )
    .map((record) => String(record.timestamp))
    .sort((left, right) => right.localeCompare(left))[0];
  localeSafeFields.updatedAt = toIsoDateFromTimestamp(
    latestSnapshotTimestamp || recordForOutput.timestamp,
  );
  if (
    isBlankText(localeSafeFields.name) ||
    isBlankText(localeSafeFields.publisher)
  ) {
    throw new Error(
      `locale-filter: missing required RU/ENG fields package=${packageId} year=${year}`,
    );
  }

  return {
    timestamp: recordForOutput.timestamp,
    pageUrl: recordForOutput.pageUrl,
    app: buildAppRecord(packageId, localeSafeFields, recordForOutput.timestamp),
  };
}

async function main() {
  const startedAt = Date.now();
  const options = normalizeRequestedYearRange(parseArgs(process.argv.slice(2)));
  options.iconChunkSize = toPositiveInt(
    options.iconChunkSize,
    DEFAULT_ICON_CHUNK_SIZE,
  );
  options.snapshotConcurrency = toPositiveInt(
    options.snapshotConcurrency,
    DEFAULT_SNAPSHOT_CONCURRENCY,
  );

  const years = resolveYearRange(options.fromYear, options.toYear);

  const { byId } = await loadAppsFile(APPS_FILE);
  const existingIds = new Set(byId.keys());
  const missingApps = await loadMissingApps(MISSING_APPS_FILE);
  await reconcileMissingApps(existingIds, missingApps);
  const selectedCandidates = [];
  const importSummary = createImportSummary(0);

  logArchiveSync(
    "start",
    `years=${years[0]}-${years[years.length - 1]} existing=${existingIds.size} missing=${missingApps.size} dryRun=${options.dryRun} forceIcons=${options.forceIcons} skipIcons=${options.skipIcons} pageLimit=${options.pageLimit} appLimit=${options.appLimit} iconYear=${options.iconYear} iconChunkSize=${options.iconChunkSize} snapshotConcurrency=${options.snapshotConcurrency} manualPackages=${options.packages.length}`,
  );

  if (options.packages.length > 0) {
    const manualCandidates = buildManualCandidates(options.packages, years[0]);
    for (const candidate of manualCandidates) {
      if (
        options.appLimit > 0 &&
        selectedCandidates.length >= options.appLimit
      ) {
        break;
      }
      if (missingApps.has(candidate.packageId)) {
        logArchiveSync(
          "discover:retry-missing",
          `source=manual id=${candidate.packageId}`,
        );
      }
      const alreadyPresent = existingIds.has(candidate.packageId);
      if (!alreadyPresent) {
        existingIds.add(candidate.packageId);
      }
      selectedCandidates.push(candidate);
      logArchiveSync(
        "discover:add",
        `source=manual id=${candidate.packageId} firstSeenYear=${candidate.firstSeenYear} selected=${selectedCandidates.length} mode=${alreadyPresent ? "refresh" : "new"}`,
      );
    }
  } else {
    for (const year of years) {
      const yearSummary = await collectSourcePackagesStreaming(
        year,
        options.pageLimit,
        options.snapshotConcurrency,
        async (candidate) => {
          if (
            options.appLimit > 0 &&
            selectedCandidates.length >= options.appLimit
          ) {
            return;
          }
          if (missingApps.has(candidate.packageId)) {
            logArchiveSync(
              "discover:skip-missing",
              `year=${year} id=${candidate.packageId} source=${candidate.sourceUrl}`,
            );
            return;
          }
          if (existingIds.has(candidate.packageId)) return;

          existingIds.add(candidate.packageId);
          selectedCandidates.push(candidate);
          importSummary.requested += 1;

          logArchiveSync(
            "discover:add",
            `year=${year} id=${candidate.packageId} source=${candidate.sourceUrl} sourceTs=${candidate.sourceTimestamp} selected=${selectedCandidates.length}`,
          );

          if (!options.dryRun) {
            await importSingleCandidate(
              candidate,
              selectedCandidates.length,
              0,
              importSummary,
              years,
              missingApps,
            );
          }
        },
        () =>
          options.appLimit > 0 && selectedCandidates.length >= options.appLimit,
      );

      logArchiveSync(
        "year",
        `year=${year} discovered=${yearSummary.discovered} snapshots=${yearSummary.snapshots} selected=${selectedCandidates.length}`,
      );

      if (
        options.appLimit > 0 &&
        selectedCandidates.length >= options.appLimit
      ) {
        logArchiveSync(
          "limit",
          `app limit reached selected=${selectedCandidates.length} appLimit=${options.appLimit}`,
        );
        break;
      }
    }
  }

  const selectedPackageIds = selectedCandidates.map((item) => item.packageId);
  logArchiveSync(
    "discovery:summary",
    `selected=${selectedPackageIds.length} mode=${options.packages.length > 0 ? "manual" : "archive-stream"}`,
  );

  if (selectedPackageIds.length === 0) {
    logArchiveSync(
      "done",
      `no new apps to import elapsedMs=${elapsedMs(startedAt)}`,
    );
    return;
  }

  if (options.dryRun) {
    const sample = selectedPackageIds.slice(0, 20).join(",");
    logArchiveSync(
      "dry-run",
      `selected=${selectedPackageIds.length} sample=${sample || "<empty>"} elapsedMs=${elapsedMs(startedAt)}`,
    );
    return;
  }

  if (options.packages.length > 0) {
    const manualImportSummary = await importPackagesGradually(
      selectedCandidates,
      years,
      missingApps,
    );
    importSummary.requested = manualImportSummary.requested;
    importSummary.added = manualImportSummary.added;
    importSummary.updated = manualImportSummary.updated;
    importSummary.failed = manualImportSummary.failed;
    importSummary.crashed = manualImportSummary.crashed;
    importSummary.fallbackAdded = manualImportSummary.fallbackAdded;
    importSummary.fallbackFailed = manualImportSummary.fallbackFailed;
    importSummary.total = manualImportSummary.total;
  } else {
    logArchiveSync(
      "import:summary",
      `requested=${importSummary.requested} added=${importSummary.added} fallbackAdded=${importSummary.fallbackAdded} updated=${importSummary.updated} failed=${importSummary.failed} fallbackFailed=${importSummary.fallbackFailed} crashed=${importSummary.crashed} total=${importSummary.total}`,
    );
  }
  logArchiveSync(
    "icon:disabled",
    "icon file sync disabled: keeping direct media URLs in apps.generated.ts",
  );

  logArchiveSync(
    "done",
    `total=${importSummary.total} requested=${selectedPackageIds.length} added=${importSummary.added} fallbackAdded=${importSummary.fallbackAdded} updated=${importSummary.updated} failed=${importSummary.failed} fallbackFailed=${importSummary.fallbackFailed} crashed=${importSummary.crashed} target=${APPS_FILE} elapsedMs=${elapsedMs(startedAt)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
