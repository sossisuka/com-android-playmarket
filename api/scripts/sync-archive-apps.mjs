import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { runSyncPackages } from "./sync-google-play.mjs";

const APPS_FILE = path.resolve("src/data/apps.generated.ts");
const ROOT_APPS_FILE = path.resolve("../apps.generated.ts");
const ICONS_DIR = path.resolve("src/data/icons");
const EXPORT_NAME = "generatedStoreApps";
const CURRENT_YEAR = new Date().getUTCFullYear();
const DEFAULT_FROM_YEAR = Number.parseInt(
  process.env.PLAY_ARCHIVE_SYNC_FROM_YEAR ??
    process.env.PLAY_ARCHIVE_SYNC_YEAR ??
    "2013",
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
  ["jan", 1],
  ["januar", 1],
  ["janvier", 1],
  ["enero", 1],
  ["gennaio", 1],
  ["janeiro", 1],
  ["stycznia", 1],
  ["february", 2],
  ["feb", 2],
  ["februar", 2],
  ["fevrier", 2],
  ["fevrier", 2],
  ["febrero", 2],
  ["fevereiro", 2],
  ["febbraio", 2],
  ["lutego", 2],
  ["march", 3],
  ["mar", 3],
  ["marz", 3],
  ["mars", 3],
  ["marzo", 3],
  ["marca", 3],
  ["april", 4],
  ["apr", 4],
  ["avril", 4],
  ["abril", 4],
  ["aprile", 4],
  ["kwietnia", 4],
  ["may", 5],
  ["mai", 5],
  ["mayo", 5],
  ["maio", 5],
  ["maggio", 5],
  ["maja", 5],
  ["june", 6],
  ["jun", 6],
  ["juin", 6],
  ["junio", 6],
  ["giugno", 6],
  ["czerwca", 6],
  ["july", 7],
  ["jul", 7],
  ["juillet", 7],
  ["julio", 7],
  ["luglio", 7],
  ["lipca", 7],
  ["august", 8],
  ["aug", 8],
  ["aout", 8],
  ["agosto", 8],
  ["sierpnia", 8],
  ["september", 9],
  ["sep", 9],
  ["sept", 9],
  ["septembre", 9],
  ["septiembre", 9],
  ["settembre", 9],
  ["wrzesnia", 9],
  ["october", 10],
  ["oct", 10],
  ["oktober", 10],
  ["octobre", 10],
  ["octubre", 10],
  ["ottobre", 10],
  ["pazdziernika", 10],
  ["november", 11],
  ["nov", 11],
  ["novembre", 11],
  ["noviembre", 11],
  ["listopada", 11],
  ["december", 12],
  ["dec", 12],
  ["dezember", 12],
  ["decembre", 12],
  ["diciembre", 12],
  ["dicembre", 12],
  ["dezembro", 12],
  ["grudnia", 12],
]);

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
      options.packages = Array.from(
        new Set(
          arg
            .slice("--packages=".length)
            .split(/[\s,;\n\r\t]+/)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      );
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
    }
  }

  return options;
}

function assertYear(year, label) {
  if (!Number.isInteger(year) || !YEAR_RE.test(String(year)) || year < 2013) {
    throw new Error(`${label} must be a 4-digit year >= 2013. Got: ${year}`);
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
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
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

  return JSON.parse(sourceText.slice(startIndex, endIndex + 1));
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
    "// Source: Google Play archive sync (web.archive.org, 2013+ pages).",
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
  const value = String(rawUrl ?? "").trim();
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

  return value;
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
    if (!isDirectMediaUrl(normalized) || screenshotSeen.has(normalized)) {
      continue;
    }
    screenshotSeen.add(normalized);
    screenshots.push(normalized);
  }

  const trailerImage = pickFirstMediaUrl([
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
    ...collectAllMatches(html, /data-video-url="([^"]+)"/gi),
    ...collectAllMatches(
      html,
      /<a[^>]*href="([^"]*(?:youtube\.com|youtu\.be)[^"]*)"/gi,
    ),
  ]) {
    const normalized = normalizeYoutubeUrl(decodeAttribute(candidate));
    if (normalized) {
      trailerUrl = normalized;
      break;
    }
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

  if (raw.startsWith("$")) return `USD ${raw.slice(1).trim()}`;
  if (raw.startsWith("€")) return `EUR ${raw.slice(1).trim()}`;
  if (raw.startsWith("£")) return `GBP ${raw.slice(1).trim()}`;

  return raw;
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

function parseNumber(value) {
  const digits = cleanText(value).replace(/[^\d]/g, "");
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

  if (
    /\b(updated|mise a jour|aktualizacja|actualizado|atualizado|miseajour)\b/.test(
      text,
    )
  ) {
    return "updated";
  }
  if (/\b(size|taille|rozmiar|tamano|tamanho|dimensione)\b/.test(text)) {
    return "size";
  }
  if (
    /\b(install|installs|instalacje|installations|instalaciones|installs)\b/.test(
      text,
    )
  ) {
    return "installs";
  }
  if (
    /\b(current version|version actuelle|wersja biezaca|version actual|versao atual|versione corrente)\b/.test(
      text,
    )
  ) {
    return "version";
  }
  if (
    /\b(requires android|wymaga androida|necessite android|requiere android|necessita android)\b/.test(
      text,
    )
  ) {
    return "requiresAndroid";
  }
  if (
    /\b(content rating|classification du contenu|ocena tresci|clasificacion del contenido|classificacao do conteudo)\b/.test(
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

  return metadata;
}

function extractPagePackageIds(html) {
  const ids = new Set();

  for (const match of html.matchAll(/data-docid="([^"]+)"/gi)) {
    const packageId = decodeAttribute(match[1]);
    if (PACKAGE_ID_RE.test(packageId)) {
      ids.add(packageId);
    }
  }

  for (const match of html.matchAll(/details\?id=([^"&<\s]+)(?:&amp;|&|")/gi)) {
    const packageId = decodeAttribute(match[1]);
    if (PACKAGE_ID_RE.test(packageId)) {
      ids.add(packageId);
    }
  }

  return [...ids];
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

function extractDetailFields(html, detailTimestamp) {
  const metadata = extractMetadataMap(html);
  const media = extractDetailMedia(html);
  const name = cleanText(
    firstMatch(html, [
      /<div class="document-title"[^>]*itemprop="name"[^>]*>\s*<div>([\s\S]*?)<\/div>/i,
      /<span itemprop="name" content="([^"]+)"/i,
      /<meta itemprop="name" content="([^"]+)"/i,
    ]),
  );
  const publisher = cleanText(
    firstMatch(html, [
      /class="document-subtitle primary"[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/a>/i,
      /itemprop="author"[\s\S]*?<span itemprop="name" content="([^"]+)"/i,
      /itemprop="author"[\s\S]*?<a[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/a>/i,
    ]),
  );
  const icon = normalizeArchiveMediaUrl(
    decodeAttribute(
      firstMatch(html, [
        /<img class="cover-image"[^>]*src="([^"]+)"/i,
        /itemprop="image" content="([^"]+)"/i,
        /itemprop="image"[^>]*src="([^"]+)"/i,
      ]),
    ),
  );
  const descriptionHtml = firstMatch(html, [
    /<div id="doc-original-text"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
  ]);
  const ratingValueRaw = cleanText(
    firstMatch(html, [
      /itemprop="ratingValue" content="([^"]+)"/i,
      /<div class="score">([\s\S]*?)<\/div>/i,
    ]),
  );
  const ratingCountRaw = cleanText(
    firstMatch(html, [
      /itemprop="ratingCount" content="([^"]+)"/i,
      /<span class="reviews-num">([\s\S]*?)<\/span>/i,
    ]),
  );
  const priceMeta = cleanText(
    firstMatch(html, [/itemprop="price" content="([^"]*)"/i]),
  );
  const priceText = cleanText(
    firstMatch(html, [
      /itemprop="price" content="[^"]*"[^>]*><\/span>\s*([^<]+)/i,
      /<span class="buy-button-price">([\s\S]*?)<\/span>/i,
    ]),
  );
  const updatedRaw = metadata.get("updated") ?? "";
  const updatedAt = parseLocalizedDateToIso(updatedRaw, detailTimestamp);
  const reviews = parseNumber(ratingCountRaw);
  const ratingValue = Number.parseFloat(ratingValueRaw.replace(",", "."));

  return {
    name,
    publisher,
    icon,
    image: icon,
    trailerImage: media.trailerImage || undefined,
    trailerUrl: media.trailerUrl,
    screenshots: media.screenshots,
    category: extractCategory(html),
    price: normalizePrice(priceMeta, priceText),
    updatedAt,
    size: cleanText(metadata.get("size")),
    installs: normalizeInstalls(metadata.get("installs")),
    version: cleanText(metadata.get("version")),
    requiresAndroid: cleanText(metadata.get("requiresAndroid")),
    contentRating: cleanText(metadata.get("contentRating")),
    description: normalizeDescriptionBlocks(descriptionHtml),
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : undefined,
    reviews,
    ratingCountText: formatCountText(reviews),
  };
}

function buildAppRecord(packageId, detail, detailTimestamp) {
  if (!detail.name || !detail.publisher) {
    throw new Error(`missing required fields for ${packageId}`);
  }

  const subtitleDate =
    detail.updatedAt || toIsoDateFromTimestamp(detailTimestamp);

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
    icon: detail.icon,
    image: detail.image,
    trailerImage: detail.trailerImage,
    trailerUrl: detail.trailerUrl,
    screenshots: detail.screenshots,
    updatedAt: detail.updatedAt,
    size: detail.size,
    installs: detail.installs,
    version: detail.version,
    requiresAndroid: detail.requiresAndroid,
    contentRating: detail.contentRating,
    description: detail.description,
    ratingValue: detail.ratingValue,
    ratingCountText: detail.ratingCountText,
    reviews: detail.reviews,
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

function buildCdxUrl(url, year, fields = "timestamp,original") {
  return (
    "https://web.archive.org/cdx/search/cdx?" +
    `url=${encodeURIComponent(url)}` +
    `&from=${year}&to=${year}` +
    "&output=json" +
    `&fl=${fields}` +
    "&filter=statuscode:200" +
    "&filter=mimetype:text/html" +
    "&collapse=digest"
  );
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

function archivePageUrl(url, timestamp) {
  return `https://web.archive.org/web/${timestamp}/${url}`;
}

function detectExtension(url, contentType) {
  const type = String(contentType).toLowerCase();
  if (type.includes("image/png")) return ".png";
  if (type.includes("image/webp")) return ".webp";
  if (type.includes("image/gif")) return ".gif";
  if (type.includes("image/svg+xml")) return ".svg";
  if (type.includes("image/jpeg")) return ".jpg";

  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return ".png";
  if (pathname.endsWith(".webp")) return ".webp";
  if (pathname.endsWith(".gif")) return ".gif";
  if (pathname.endsWith(".svg")) return ".svg";
  return ".jpg";
}

async function findExistingIconPath(packageId) {
  for (const extension of [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]) {
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

  const image = await fetchBinary(iconUrl, `icon:${packageId}`, "image");
  const extension = detectExtension(image.finalUrl, image.contentType);
  const filePath = path.join(ICONS_DIR, `${packageId}${extension}`);
  await writeFile(filePath, image.bytes);
  return { status: "saved", filePath };
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

async function collectSourcePackages(year, pageLimit) {
  const seen = new Map();
  const summary = [];

  for (const sourceUrl of SOURCE_PAGES) {
    const rows = await fetchCdxRows(sourceUrl, year);
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
  onCandidate,
  shouldStop = () => false,
) {
  const seen = new Set();
  const summary = [];

  for (const sourceUrl of SOURCE_PAGES) {
    if (shouldStop()) break;

    const rows = await fetchCdxRows(sourceUrl, year);
    const scopedRows = pageLimit > 0 ? rows.slice(0, pageLimit) : rows;
    logArchiveSync(
      "discover:source",
      `year=${year} source=${sourceUrl} snapshots=${scopedRows.length}/${rows.length}`,
    );

    for (const row of scopedRows) {
      if (shouldStop()) break;

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
        if (shouldStop()) break;
        if (seen.has(packageId)) continue;
        seen.add(packageId);
        await onCandidate({
          packageId,
          sourceUrl,
          sourceTimestamp: finalTimestamp,
          firstSeenYear: year,
          lastSeenYear: year,
        });
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
  if (Number.isInteger(options.iconYear) && options.iconYear >= 2013) {
    return options.iconYear;
  }
  return Number(candidate.firstSeenYear) || 2013;
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
    if (!Number.isInteger(year) || year < 2013 || year > CURRENT_YEAR) {
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

async function mirrorAppsFileToRoot() {
  const nextText = await readFile(APPS_FILE, "utf8");

  try {
    await writeFile(ROOT_APPS_FILE, nextText, "utf8");
  } catch (error) {
    console.warn(
      `[archive-sync] root mirror skipped: ${error?.message ?? String(error)}`,
    );
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
    (year) => Number.isInteger(year) && year >= 2013 && year <= CURRENT_YEAR,
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
  if (loaded.byId.has(candidate.packageId)) {
    return {
      action: "exists",
      total: loaded.apps.length,
    };
  }

  const nextApps = [...loaded.apps, detailRecord.app];
  await writeFile(APPS_FILE, serializeApps(nextApps), "utf8");
  await mirrorAppsFileToRoot();

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
  const failures = [];

  logArchiveSync(
    "fallback:start",
    `item=${itemRef} id=${candidate.packageId} years=${fallbackYears.join(",")} preferredTs=${preferredTimestamp || "<none>"}`,
  );

  for (const year of fallbackYears) {
    const stepStartedAt = Date.now();
    try {
      logArchiveSync(
        "fallback:try",
        `item=${itemRef} id=${candidate.packageId} year=${year}`,
      );

      const detailRecord = await fetchDetailRecord(
        candidate.packageId,
        preferredTimestamp,
        year,
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
      failures.push(`${year}:${message}`);
      logArchiveSync(
        "fallback:miss",
        `item=${itemRef} id=${candidate.packageId} year=${year} error=${message} elapsedMs=${elapsedMs(stepStartedAt)}`,
      );
    }
  }

  return {
    status: "failed",
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

async function importSingleCandidate(candidate, order, total, summary, years) {
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
        action = "fallback-added";
      } else if (fallback.status === "exists") {
        summary.failed = Math.max(0, summary.failed - itemFailed);
        summary.total = Number(fallback.total ?? summary.total);
        action = "fallback-exists";
      } else {
        summary.fallbackFailed += 1;
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
    logArchiveSync(
      "import:crash",
      `item=${itemRef} id=${candidate.packageId} error=${error?.message ?? String(error)} elapsedMs=${elapsedMs(itemStartedAt)}`,
    );
  }
}

async function importPackagesGradually(candidates, years) {
  const startedAt = Date.now();
  const summary = createImportSummary(candidates.length);

  for (let index = 0; index < candidates.length; index += 1) {
    await importSingleCandidate(
      candidates[index],
      index + 1,
      candidates.length,
      summary,
      years,
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
  const chosenTimestamp = chooseNearestTimestamp(rows, preferredTimestamp);

  if (!chosenTimestamp) {
    throw new Error(
      `no archived details page found for ${packageId} in ${year}`,
    );
  }

  const page = await fetchText(
    archivePageUrl(detailsUrl, chosenTimestamp),
    `details:${packageId}:${chosenTimestamp}`,
    "page",
  );
  const detailTimestamp =
    extractWaybackTimestamp(page.finalUrl) || chosenTimestamp;
  const fields = extractDetailFields(page.text, detailTimestamp);
  return {
    timestamp: detailTimestamp,
    pageUrl: page.finalUrl,
    app: buildAppRecord(packageId, fields, detailTimestamp),
  };
}

async function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  options.iconChunkSize = toPositiveInt(
    options.iconChunkSize,
    DEFAULT_ICON_CHUNK_SIZE,
  );

  const years = resolveYearRange(options.fromYear, options.toYear);

  const { byId } = await loadAppsFile(APPS_FILE);
  const existingIds = new Set(byId.keys());
  const selectedCandidates = [];
  const importSummary = createImportSummary(0);

  logArchiveSync(
    "start",
    `years=${years[0]}-${years[years.length - 1]} existing=${existingIds.size} dryRun=${options.dryRun} forceIcons=${options.forceIcons} skipIcons=${options.skipIcons} pageLimit=${options.pageLimit} appLimit=${options.appLimit} iconYear=${options.iconYear} iconChunkSize=${options.iconChunkSize} manualPackages=${options.packages.length}`,
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
      if (existingIds.has(candidate.packageId)) continue;
      existingIds.add(candidate.packageId);
      selectedCandidates.push(candidate);
      logArchiveSync(
        "discover:add",
        `source=manual id=${candidate.packageId} firstSeenYear=${candidate.firstSeenYear} selected=${selectedCandidates.length}`,
      );
    }
  } else {
    for (const year of years) {
      const yearSummary = await collectSourcePackagesStreaming(
        year,
        options.pageLimit,
        async (candidate) => {
          if (
            options.appLimit > 0 &&
            selectedCandidates.length >= options.appLimit
          ) {
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

  await mirrorAppsFileToRoot();
  const currentApps = await loadAppsFile(APPS_FILE);
  const importedCandidates = selectedCandidates.filter((candidate) =>
    currentApps.byId.has(candidate.packageId),
  );
  logArchiveSync(
    "icon:selection",
    `candidates=${selectedCandidates.length} imported=${importedCandidates.length}`,
  );
  await runArchiveIconSync(importedCandidates, options);

  logArchiveSync(
    "done",
    `total=${importSummary.total} requested=${selectedPackageIds.length} added=${importSummary.added} fallbackAdded=${importSummary.fallbackAdded} updated=${importSummary.updated} failed=${importSummary.failed} fallbackFailed=${importSummary.fallbackFailed} crashed=${importSummary.crashed} target=${APPS_FILE} elapsedMs=${elapsedMs(startedAt)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
