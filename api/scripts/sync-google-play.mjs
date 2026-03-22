import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import gplay from "google-play-scraper";

const COUNTRY = process.env.PLAY_COUNTRY ?? "us";
const LANG = process.env.PLAY_LANG ?? "en";
const EN_LANG = process.env.PLAY_EN_LANG ?? "en";
const RU_LANG = process.env.PLAY_RU_LANG ?? "ru";
const RETRY_COUNT = Number.parseInt(process.env.PLAY_RETRY_COUNT ?? "3", 10);
const RETRY_BASE_DELAY_MS = Number.parseInt(
  process.env.PLAY_RETRY_BASE_DELAY_MS ?? "350",
  10,
);
const REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.PLAY_REQUEST_TIMEOUT_MS ?? "30000",
  10,
);
const PERSIST_EVERY = Number.parseInt(
  process.env.PLAY_PERSIST_EVERY ?? "25",
  10,
);
const FEED_SIZE = Number.parseInt(process.env.PLAY_FEED_SIZE ?? "500", 10);
const FEED_CONCURRENCY = Number.parseInt(
  process.env.PLAY_FEED_CONCURRENCY ?? "4",
  10,
);
const SEARCH_ENABLED = /^(1|true|yes)$/i.test(
  process.env.PLAY_SEARCH_ENABLED ?? "1",
);
const SEARCH_SIZE = Number.parseInt(process.env.PLAY_SEARCH_SIZE ?? "200", 10);
const SEARCH_CONCURRENCY = Number.parseInt(
  process.env.PLAY_SEARCH_CONCURRENCY ?? "4",
  10,
);
const SEARCH_TERMS_LIMIT = Number.parseInt(
  process.env.PLAY_SEARCH_TERMS_LIMIT ?? "26",
  10,
);
const FULL_RESYNC = /^(1|true|yes)$/i.test(process.env.PLAY_FULL_RESYNC ?? "0");
const DETAIL_CONCURRENCY = Number.parseInt(
  process.env.PLAY_DETAIL_CONCURRENCY ?? "12",
  10,
);
const BATCH_SIZE = Number.parseInt(process.env.PLAY_BATCH_SIZE ?? "1000", 10);
const MAX_NEW_APPS = Number.parseInt(process.env.PLAY_MAX_NEW_APPS ?? "0", 10);
const PACKAGE_IDS_ENV = (process.env.PLAY_PACKAGE_IDS ?? "").trim();

const OUT_APPS_FILE = path.resolve("src/data/apps.generated.ts");
const OUT_CATEGORIES_FILE = path.resolve(
  "src/data/playCategories.generated.ts",
);

const fallbackReviewAvatar = "/assets/users/unnamed.png";
const defaultReviews = [
  {
    id: "r1",
    author: "Alex",
    text: "Works well and stays stable after recent updates.",
    stars: 4,
    avatar: fallbackReviewAvatar,
  },
  {
    id: "r2",
    author: "Sam",
    text: "Good app overall, but there is room for polish.",
    stars: 4,
    avatar: fallbackReviewAvatar,
  },
];

function createStats() {
  return {
    feed: { jobs: 0, failedJobs: 0, retries: 0, appsSeen: 0, uniqueAppIds: 0 },
    search: {
      enabled: SEARCH_ENABLED,
      terms: 0,
      jobs: 0,
      failedJobs: 0,
      retries: 0,
      appsSeen: 0,
      uniqueAppIds: 0,
    },
    details: {
      requested: 0,
      fetched: 0,
      failed: 0,
      retries: 0,
      fallbackToFeedOnly: 0,
    },
    merge: {
      existing: 0,
      candidates: 0,
      queued: 0,
      added: 0,
      updated: 0,
      skippedExisting: 0,
    },
    errorsByCode: {},
  };
}

function addErrorCode(stats, code) {
  const key = String(code || "unknown");
  stats.errorsByCode[key] = (stats.errorsByCode[key] ?? 0) + 1;
}

function errorCode(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  if (status) return `http_${status}`;
  const message = String(error?.message ?? "");
  if (/\b404\b/.test(message)) return "http_404";
  if (/\b403\b/.test(message)) return "http_403";
  if (/\b5\d\d\b/.test(message)) return "http_5xx";
  if (/\b429\b/.test(message)) return "http_429";
  if (/timeout/i.test(message)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED/i.test(message))
    return "network";
  return "unknown";
}

function shouldRetryForCode(code) {
  if (!code) return false;
  if (code === "http_429") return true;
  if (code === "timeout") return true;
  if (code === "network") return true;
  if (code === "http_5xx") return true;
  if (/^http_5\d\d$/.test(code)) return true;
  return false;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs);
    }),
  ]);
}

async function withRetry(taskLabel, fn, statsSection, stats, meta) {
  let attempt = 0;
  while (attempt <= RETRY_COUNT) {
    try {
      return await withTimeout(
        fn(),
        REQUEST_TIMEOUT_MS,
        `${taskLabel}${meta ? ` ${meta}` : ""}`,
      );
    } catch (error) {
      const code = errorCode(error);
      const canRetry = shouldRetryForCode(code);
      const finalAttempt = attempt >= RETRY_COUNT || !canRetry;
      if (finalAttempt) {
        addErrorCode(stats, code);
        throw error;
      }

      statsSection.retries += 1;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      const ctx = meta ? ` ${meta}` : "";
      console.warn(
        `[retry] ${taskLabel}${ctx} failed (${code}), retry ${attempt + 1}/${RETRY_COUNT} in ${delay}ms`,
      );
      await sleep(delay);
      attempt += 1;
    }
  }
}

function stripHtml(input) {
  return String(input ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function toTimestamp(value) {
  if (!value && value !== 0) return 0;
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "number")
    return new Date(value).toISOString().slice(0, 10);
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return String(value);
  return new Date(parsed).toISOString().slice(0, 10);
}

function categoryLabelFromId(id) {
  return id
    .replace(/^GAME_/g, "GAME ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAnd\b/g, "&");
}

function chooseIcon(genreId) {
  const g = String(genreId ?? "").toLowerCase();
  if (g.includes("music")) return "music";
  if (g.includes("video")) return "video";
  if (g.includes("photo") || g.includes("camera")) return "camera";
  if (g.includes("news")) return "newspaper";
  if (g.includes("book")) return "file";
  if (g.includes("sport")) return "heartbeat";
  if (g.includes("social")) return "wifi";
  if (g.includes("map") || g.includes("travel")) return "rotate";
  if (g.includes("shopping")) return "cart";
  if (g.includes("game")) return "gamepad";
  return "gamepad";
}

function chooseColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 45% 45%)`;
}

function formatInstalls(min, max) {
  const format = (n) => (n ? Number(n).toLocaleString("en-US") : "");
  if (min && max) return `${format(min)} - ${format(max)}`;
  if (min) return `${format(min)}+`;
  return "Unknown";
}

function formatPrice(app) {
  if (app.free || Number(app.price) === 0) return "FREE";
  const currency = app.currency ? `${app.currency} ` : "$";
  const numeric = Number(app.price);
  if (Number.isNaN(numeric)) return `${currency}${app.price}`;
  return `${currency}${numeric.toFixed(2)}`;
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

function fallbackYoutubeSearchUrl(app) {
  const query = encodeURIComponent(
    `${app.title ?? app.name ?? app.appId ?? "app"} trailer`,
  );
  return `https://www.youtube.com/results?search_query=${query}`;
}

function resolveTrailerUrl(app) {
  const directCandidates = [
    app.video,
    app.trailer,
    app.trailerUrl,
    app.youtubeTrailer,
    app.youtubeUrl,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeYoutubeUrl(candidate);
    if (normalized) return normalized;
  }

  return fallbackYoutubeSearchUrl(app);
}

async function mapWithConcurrency(items, limit, mapper) {
  const result = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      result[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return result;
}

function getCollections() {
  const allCollections = Object.values(gplay.collection);
  const fromEnv = (process.env.PLAY_COLLECTIONS ?? "").trim();
  if (!fromEnv) return allCollections;
  const selected = fromEnv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return selected.filter((value) => allCollections.includes(value));
}

function getCategoryIds() {
  const allCategoryIds = Object.values(gplay.category).filter(
    (value) => typeof value === "string",
  );
  const fromEnv = (process.env.PLAY_CATEGORIES ?? "ALL").trim();
  if (fromEnv === "ALL") return allCategoryIds;
  const selected = fromEnv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return selected.filter((value) => allCategoryIds.includes(value));
}

function getSearchTerms() {
  const fromEnv = (process.env.PLAY_SEARCH_TERMS ?? "").trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, SEARCH_TERMS_LIMIT);
  }

  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
  const digits = "0123456789".split("");
  return [...alphabet, ...digits].slice(0, SEARCH_TERMS_LIMIT);
}

function parsePackageIds(input) {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(input.map((item) => String(item ?? "").trim()).filter(Boolean)),
    );
  }

  return Array.from(
    new Set(
      String(input ?? "")
        .split(/[\s,;\n\r\t]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseGeneratedArray(sourceText, exportName) {
  const marker = `export const ${exportName}`;
  const markerIndex = sourceText.indexOf(marker);
  if (markerIndex < 0) return [];

  const assignIndex = sourceText.indexOf("=", markerIndex);
  if (assignIndex < 0) return [];

  const start = sourceText.indexOf("[", assignIndex);
  if (start < 0) return [];

  const end = findMatchingArrayEnd(sourceText, start);
  if (end < 0 || end <= start) return [];

  const json = sourceText.slice(start, end + 1);
  return JSON.parse(json);
}

function findMatchingArrayEnd(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

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
      if (depth === 0) return i;
      continue;
    }
  }

  return -1;
}

async function readExistingApps() {
  try {
    const text = await readFile(OUT_APPS_FILE, "utf8");
    const parsed = parseGeneratedArray(text, "generatedStoreApps");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchFeedAppIds(stats, onProgress) {
  const collections = getCollections();
  const categoryIds = getCategoryIds();

  const feedJobs = [];
  for (const collection of collections) {
    for (const category of categoryIds) {
      feedJobs.push({ collection, category });
    }
  }

  console.log(
    `Fetching feeds: ${feedJobs.length} combinations, ${FEED_SIZE} apps/feed (${COUNTRY}/${LANG})...`,
  );
  stats.feed.jobs = feedJobs.length;
  let completedJobs = 0;

  const feedResults = await mapWithConcurrency(
    feedJobs,
    FEED_CONCURRENCY,
    async (job) => {
      try {
        const apps = await withRetry(
          "feed.list",
          () =>
            gplay.list({
              collection: job.collection,
              category: job.category,
              num: FEED_SIZE,
              country: COUNTRY,
              lang: LANG,
            }),
          stats.feed,
          stats,
          `collection=${job.collection}, category=${job.category}`,
        );
        return { ...job, apps };
      } catch {
        stats.feed.failedJobs += 1;
        return { ...job, apps: [] };
      } finally {
        completedJobs += 1;
        if (typeof onProgress === "function") {
          onProgress({
            stage: "feed",
            completed: completedJobs,
            total: feedJobs.length,
            percent: feedJobs.length
              ? Math.round((completedJobs / feedJobs.length) * 100)
              : 100,
          });
        }
      }
    },
  );

  const byAppId = new Map();
  for (const feed of feedResults) {
    stats.feed.appsSeen += feed.apps.length;
    for (const app of feed.apps) {
      if (!app?.appId) continue;
      const ts = toTimestamp(app.released) || toTimestamp(app.updated);
      const existing = byAppId.get(app.appId);
      if (!existing || ts > existing._ts) {
        byAppId.set(app.appId, {
          ...app,
          genreId: app.genreId ?? feed.category,
          _ts: ts,
        });
      }
    }
  }

  stats.feed.uniqueAppIds = byAppId.size;

  return Array.from(byAppId.values()).sort(
    (a, b) => (b._ts ?? 0) - (a._ts ?? 0),
  );
}

async function fetchSearchAppIds(stats, onProgress) {
  if (!SEARCH_ENABLED) return [];

  const terms = getSearchTerms();
  stats.search.terms = terms.length;
  stats.search.jobs = terms.length;
  let completedJobs = 0;
  console.log(
    `Fetching search index: ${terms.length} terms, ${SEARCH_SIZE} apps/term (${COUNTRY}/${LANG})...`,
  );

  const results = await mapWithConcurrency(
    terms,
    SEARCH_CONCURRENCY,
    async (term) => {
      try {
        const apps = await withRetry(
          "search.apps",
          () =>
            gplay.search({
              term,
              num: SEARCH_SIZE,
              country: COUNTRY,
              lang: LANG,
            }),
          stats.search,
          stats,
          `term=${term}`,
        );
        return { term, apps };
      } catch {
        stats.search.failedJobs += 1;
        return { term, apps: [] };
      } finally {
        completedJobs += 1;
        if (typeof onProgress === "function") {
          onProgress({
            stage: "search",
            completed: completedJobs,
            total: terms.length,
            percent: terms.length
              ? Math.round((completedJobs / terms.length) * 100)
              : 100,
          });
        }
      }
    },
  );

  const byAppId = new Map();
  for (const result of results) {
    stats.search.appsSeen += result.apps.length;
    for (const app of result.apps) {
      if (!app?.appId) continue;
      const ts = toTimestamp(app.released) || toTimestamp(app.updated);
      const existing = byAppId.get(app.appId);
      if (!existing || ts > existing._ts) {
        byAppId.set(app.appId, {
          ...app,
          _ts: ts,
        });
      }
    }
  }

  stats.search.uniqueAppIds = byAppId.size;
  return Array.from(byAppId.values()).sort(
    (a, b) => (b._ts ?? 0) - (a._ts ?? 0),
  );
}

async function fetchAppByLang(appId, lang, stats) {
  return withRetry(
    "details.app",
    () => gplay.app({ appId, country: COUNTRY, lang }),
    stats.details,
    stats,
    `appId=${appId}, lang=${lang}`,
  );
}

async function fetchAppDetails(feedApps, stats) {
  return mapWithConcurrency(feedApps, DETAIL_CONCURRENCY, async (item) => {
    stats.details.requested += 1;
    const [english, russian] = await Promise.all([
      fetchAppByLang(item.appId, EN_LANG, stats).catch((error) => {
        addErrorCode(stats, errorCode(error));
        return undefined;
      }),
      RU_LANG === EN_LANG
        ? undefined
        : fetchAppByLang(item.appId, RU_LANG, stats).catch((error) => {
            addErrorCode(stats, errorCode(error));
            return undefined;
          }),
    ]);

    const base = english ?? russian;
    if (!base) {
      stats.details.failed += 1;
      stats.details.fallbackToFeedOnly += 1;
      return item;
    }

    stats.details.fetched += 1;

    return {
      ...item,
      ...base,
      _ru: russian,
      _ts: item._ts,
    };
  });
}

async function fetchAppsByPackageIds(packageIds, stats) {
  return mapWithConcurrency(packageIds, DETAIL_CONCURRENCY, async (appId) => {
    stats.details.requested += 1;
    const [english, russian] = await Promise.all([
      fetchAppByLang(appId, EN_LANG, stats).catch((error) => {
        addErrorCode(stats, errorCode(error));
        return undefined;
      }),
      RU_LANG === EN_LANG
        ? undefined
        : fetchAppByLang(appId, RU_LANG, stats).catch((error) => {
            addErrorCode(stats, errorCode(error));
            return undefined;
          }),
    ]);

    const base = english ?? russian;
    if (!base) {
      stats.details.failed += 1;
      return null;
    }

    stats.details.fetched += 1;
    return {
      ...base,
      appId,
      _ru: russian,
      _ts: toTimestamp(base.updated) || toTimestamp(base.released),
    };
  });
}

function normalizeApps(rawApps) {
  return rawApps
    .map((app) => {
      const localizedRu = app._ru ?? {};
      const localizedName =
        localizedRu.title || localizedRu.name || app.title || app.name;
      const categoryId = app.genreId || app.category || "APPLICATION";
      const descriptionText =
        stripHtml(localizedRu.description || localizedRu.summary) ||
        stripHtml(app.description || app.summary);
      const recentChanges =
        stripHtml(localizedRu.recentChanges) || stripHtml(app.recentChanges);
      const screenshots = (app.screenshots ?? []).slice(0, 8);

      return {
        id: app.appId ?? app.id,
        name: localizedName ?? app.appId ?? app.id,
        publisher: app.developer ?? app.publisher ?? "Unknown developer",
        subtitle: `${app.developer ?? app.publisher ?? "Unknown developer"} - ${formatDate(app.released ?? app.updated ?? app.updatedAt)}`,
        category: categoryId,
        price: formatPrice(app),
        color: app.color ?? chooseColor(app.appId ?? app.id),
        icon: app.icon ?? chooseIcon(categoryId),
        image: app.iconUrl ?? app.image ?? app.icon,
        updatedAt: formatDate(app.updated ?? app.released ?? app.updatedAt),
        size: app.size ?? "Varies with device",
        installs:
          formatInstalls(app.minInstalls, app.maxInstalls) ||
          app.installs ||
          "Unknown",
        version: app.version ?? "Varies with device",
        requiresAndroid:
          app.androidVersionText ?? app.requiresAndroid ?? "Varies with device",
        contentRating: app.contentRating ?? "Everyone",
        website: app.developerWebsite || app.website || undefined,
        privacyPolicy: app.privacyPolicy || undefined,
        description: descriptionText
          ? [descriptionText]
          : (app.description ?? ["No description provided."]),
        whatsNew: recentChanges
          ? [recentChanges]
          : (app.whatsNew ?? ["Data refreshed from Google Play."]),
        trailerImage: app.headerImage || app.trailerImage || undefined,
        trailerUrl: resolveTrailerUrl(app),
        screenshots: screenshots.length
          ? screenshots
          : (app.screenshots ?? [app.icon].filter(Boolean)),
        ratingValue: Number(app.score ?? app.ratingValue ?? 0),
        ratingCountText:
          app.ratingCountText ??
          `(${Number(app.ratings ?? 0).toLocaleString("en-US")})`,
        reviews: app.reviews ?? defaultReviews,
        similarIds: [],
        moreFromDeveloperIds: [],
      };
    })
    .filter((item) => Boolean(item.id));
}

function addRelations(apps) {
  const ids = apps.map((app) => app.id);
  const byPublisher = new Map();
  for (const app of apps) {
    const list = byPublisher.get(app.publisher) ?? [];
    list.push(app.id);
    byPublisher.set(app.publisher, list);
  }

  return apps.map((app, index) => {
    const similarIds = [];
    for (let i = 1; similarIds.length < 3 && i < ids.length; i += 1) {
      const candidate = ids[(index + i) % ids.length];
      if (candidate !== app.id) similarIds.push(candidate);
    }

    const moreFromDeveloperIds = (byPublisher.get(app.publisher) ?? [])
      .filter((id) => id !== app.id)
      .slice(0, 3);

    return { ...app, similarIds, moreFromDeveloperIds };
  });
}

function mergeById(existingApps, newApps, options = {}) {
  const { overwriteExisting = false, stats, onAdded, onUpdated } = options;
  const byId = new Map(existingApps.map((app) => [app.id, app]));

  for (const app of newApps) {
    const alreadyExists = byId.has(app.id);
    if (alreadyExists && !overwriteExisting) {
      if (stats) stats.merge.skippedExisting += 1;
      continue;
    }

    if (alreadyExists && overwriteExisting) {
      if (stats) stats.merge.updated += 1;
      if (typeof onUpdated === "function") onUpdated(app.id);
    } else {
      if (stats) stats.merge.added += 1;
      if (typeof onAdded === "function") onAdded(app.id);
    }

    byId.set(app.id, app);
  }

  return Array.from(byId.values());
}

function buildCategoriesFromApps(apps) {
  const unique = Array.from(
    new Set(apps.map((app) => app.category).filter(Boolean)),
  );
  const categories = unique.map((id) => ({
    id,
    label: categoryLabelFromId(id),
  }));
  categories.sort((a, b) => a.label.localeCompare(b.label));
  return categories;
}

function asAppsModule(apps) {
  return `import type { AppData } from "./apps";

// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Generated at: ${new Date().toISOString()}
// Source: Google Play (${COUNTRY}/${LANG}), incremental sync.

export const generatedStoreApps: AppData[] = ${JSON.stringify(apps, null, 2)};
`;
}

function asCategoriesModule(categories) {
  return `export type PlayCategory = { id: string; label: string };

// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Generated at: ${new Date().toISOString()}

export const generatedPlayCategories: PlayCategory[] = ${JSON.stringify(categories, null, 2)};
`;
}

async function persist(apps) {
  const normalized = addRelations(apps);
  const categories = buildCategoriesFromApps(normalized);
  await writeFile(OUT_APPS_FILE, asAppsModule(normalized), "utf8");
  await writeFile(OUT_CATEGORIES_FILE, asCategoriesModule(categories), "utf8");
}

function printStats(stats) {
  console.log("");
  console.log("Sync stats:");
  console.log(
    JSON.stringify(
      {
        config: {
          country: COUNTRY,
          lang: LANG,
          fullResync: FULL_RESYNC,
          feedSize: FEED_SIZE,
          searchEnabled: SEARCH_ENABLED,
          searchSize: SEARCH_SIZE,
          retryCount: RETRY_COUNT,
        },
        ...stats,
      },
      null,
      2,
    ),
  );
}

export async function runSync(options = {}) {
  const effectiveBatchSize = Math.max(
    1,
    Number.parseInt(String(options.batchSize ?? BATCH_SIZE), 10) || BATCH_SIZE,
  );
  const onEvent =
    typeof options.onEvent === "function" ? options.onEvent : () => {};
  const emit = (type, payload = {}) => onEvent({ type, payload });
  const emitStats = () =>
    emit("stats", { stats: JSON.parse(JSON.stringify(stats)) });
  const persistEvery = Math.max(
    1,
    Number.parseInt(String(options.persistEvery ?? PERSIST_EVERY), 10) ||
      PERSIST_EVERY,
  );

  emit("start", {
    mode: "full",
    country: COUNTRY,
    lang: LANG,
    fullResync: FULL_RESYNC,
    searchEnabled: SEARCH_ENABLED,
  });

  const stats = createStats();
  const existingApps = await readExistingApps();
  const existingIds = new Set(existingApps.map((app) => app.id));
  stats.merge.existing = existingIds.size;
  console.log(`Existing apps in DB: ${existingIds.size}`);
  emit("existing", { count: existingIds.size });
  emitStats();

  const feedApps = await fetchFeedAppIds(stats, (payload) =>
    emit("stage_progress", payload),
  );
  emitStats();
  const searchApps = await fetchSearchAppIds(stats, (payload) =>
    emit("stage_progress", payload),
  );
  const candidatesById = new Map();

  for (const app of [...feedApps, ...searchApps]) {
    if (!app?.appId) continue;
    const existing = candidatesById.get(app.appId);
    if (!existing || (app._ts ?? 0) > (existing._ts ?? 0)) {
      candidatesById.set(app.appId, app);
    }
  }

  const candidates = Array.from(candidatesById.values()).sort(
    (a, b) => (b._ts ?? 0) - (a._ts ?? 0),
  );
  stats.merge.candidates = candidates.length;

  const queueSource = FULL_RESYNC
    ? candidates
    : candidates.filter((app) => !existingIds.has(app.appId));
  const queued =
    MAX_NEW_APPS > 0 ? queueSource.slice(0, MAX_NEW_APPS) : queueSource;
  stats.merge.queued = queued.length;
  emit("queue", {
    candidates: candidates.length,
    feedCandidates: feedApps.length,
    searchCandidates: searchApps.length,
    queued: queued.length,
  });
  emitStats();

  console.log(
    `Found ${candidates.length} unique candidates (feed=${feedApps.length}, search=${searchApps.length}), queued: ${queued.length}`,
  );
  if (!queued.length) {
    await persist(existingApps);
    console.log("No new apps. Categories refreshed.");
    printStats(stats);
    emitStats();
    emit("done", { total: existingApps.length, stats });
    return { total: existingApps.length, stats };
  }

  let currentApps = [...existingApps];
  let processed = 0;
  let batchNumber = 0;
  let dirtySincePersist = 0;
  for (let index = 0; index < queued.length; index += effectiveBatchSize) {
    batchNumber += 1;
    const chunk = queued.slice(index, index + effectiveBatchSize);
    console.log(
      `Processing batch ${Math.floor(index / effectiveBatchSize) + 1}: ${chunk.length} apps...`,
    );
    emit("batch_start", {
      batch: batchNumber,
      batchSize: chunk.length,
      processed,
      total: queued.length,
    });
    const details = await fetchAppDetails(chunk, stats);
    const normalizedChunk = normalizeApps(details);
    const beforeAdded = stats.merge.added;
    const beforeUpdated = stats.merge.updated;
    const beforeSkipped = stats.merge.skippedExisting;
    const chunkIds = chunk.map((item) => item.appId).filter(Boolean);
    currentApps = mergeById(currentApps, normalizedChunk, {
      overwriteExisting: FULL_RESYNC,
      stats,
      onAdded: (id) => emit("app_added", { id }),
      onUpdated: (id) => emit("app_updated", { id }),
    });
    dirtySincePersist += chunk.length;
    const shouldPersistNow =
      dirtySincePersist >= persistEvery ||
      processed + chunk.length >= queued.length;
    if (shouldPersistNow) {
      await persist(currentApps);
      dirtySincePersist = 0;
      console.log(`Saved total apps: ${currentApps.length}`);
      emit("persist", {
        currentTotal: currentApps.length,
        processed: processed + chunk.length,
      });
    }
    processed += chunk.length;
    const addedDelta = stats.merge.added - beforeAdded;
    const updatedDelta = stats.merge.updated - beforeUpdated;
    const skippedDelta = stats.merge.skippedExisting - beforeSkipped;
    const action =
      addedDelta > 0 ? "added" : updatedDelta > 0 ? "updated" : "skipped";
    const id = chunkIds[0] ?? normalizedChunk[0]?.id ?? "unknown";

    emit("item_result", {
      id,
      action,
      addedDelta,
      updatedDelta,
      skippedDelta,
      processed,
      total: queued.length,
      remaining: Math.max(queued.length - processed, 0),
    });
    emit("progress", {
      processed,
      total: queued.length,
      percent: queued.length
        ? Math.round((processed / queued.length) * 100)
        : 100,
      currentTotal: currentApps.length,
      remaining: Math.max(queued.length - processed, 0),
    });
    emitStats();
  }

  console.log(`Sync complete. Total apps: ${currentApps.length}`);
  printStats(stats);
  emitStats();
  emit("done", { total: currentApps.length, stats });
  return { total: currentApps.length, stats };
}

export async function runSyncPackages(packageIdsInput, options = {}) {
  const packageIds = parsePackageIds(packageIdsInput);
  const onEvent =
    typeof options.onEvent === "function" ? options.onEvent : () => {};
  const emit = (type, payload = {}) => onEvent({ type, payload });
  const emitStats = () =>
    emit("stats", { stats: JSON.parse(JSON.stringify(stats)) });
  const persistEvery = Math.max(
    1,
    Number.parseInt(String(options.persistEvery ?? PERSIST_EVERY), 10) ||
      PERSIST_EVERY,
  );

  emit("start", {
    mode: "packages",
    country: COUNTRY,
    lang: LANG,
    fullResync: true,
    searchEnabled: false,
  });

  const stats = createStats();
  const existingApps = await readExistingApps();
  stats.merge.existing = existingApps.length;
  emit("existing", { count: existingApps.length });
  emitStats();

  stats.merge.candidates = packageIds.length;
  stats.merge.queued = packageIds.length;
  emit("queue", {
    candidates: packageIds.length,
    feedCandidates: 0,
    searchCandidates: 0,
    queued: packageIds.length,
  });
  emitStats();

  if (!packageIds.length) {
    emit("done", { total: existingApps.length, stats });
    return { total: existingApps.length, stats };
  }

  const fetched = await fetchAppsByPackageIds(packageIds, stats);

  let processed = 0;
  let currentApps = [...existingApps];
  let dirtySincePersist = 0;
  for (let i = 0; i < packageIds.length; i += 1) {
    const requestedId = packageIds[i];
    const fetchedItem = fetched[i];
    processed += 1;
    if (!fetchedItem) {
      emit("item_result", {
        id: requestedId,
        action: "failed",
        addedDelta: 0,
        updatedDelta: 0,
        skippedDelta: 0,
        processed,
        total: packageIds.length,
        remaining: Math.max(packageIds.length - processed, 0),
      });
    } else {
      const normalizedList = normalizeApps([fetchedItem]);
      const app = normalizedList[0];
      if (!app) {
        emit("item_result", {
          id: requestedId,
          action: "failed",
          addedDelta: 0,
          updatedDelta: 0,
          skippedDelta: 0,
          processed,
          total: packageIds.length,
          remaining: Math.max(packageIds.length - processed, 0),
        });
      } else {
        const beforeAdded = stats.merge.added;
        const beforeUpdated = stats.merge.updated;
        const beforeSkipped = stats.merge.skippedExisting;
        currentApps = mergeById(currentApps, [app], {
          overwriteExisting: true,
          stats,
          onAdded: (id) => emit("app_added", { id }),
          onUpdated: (id) => emit("app_updated", { id }),
        });
        const addedDelta = stats.merge.added - beforeAdded;
        const updatedDelta = stats.merge.updated - beforeUpdated;
        const skippedDelta = stats.merge.skippedExisting - beforeSkipped;
        const action =
          addedDelta > 0 ? "added" : updatedDelta > 0 ? "updated" : "skipped";
        dirtySincePersist += 1;
        emit("item_result", {
          id: app.id,
          action,
          addedDelta,
          updatedDelta,
          skippedDelta,
          processed,
          total: packageIds.length,
          remaining: Math.max(packageIds.length - processed, 0),
        });
      }
    }

    const shouldPersistNow =
      dirtySincePersist >= persistEvery || processed >= packageIds.length;
    if (shouldPersistNow && dirtySincePersist > 0) {
      await persist(currentApps);
      dirtySincePersist = 0;
      emit("persist", { currentTotal: currentApps.length, processed });
    }

    emit("progress", {
      processed,
      total: packageIds.length,
      percent: packageIds.length
        ? Math.round((processed / packageIds.length) * 100)
        : 100,
      currentTotal: currentApps.length,
      remaining: Math.max(packageIds.length - processed, 0),
    });
    emitStats();
  }

  emitStats();
  emit("done", { total: currentApps.length, stats });
  return { total: currentApps.length, stats };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const runner = PACKAGE_IDS_ENV ? runSyncPackages(PACKAGE_IDS_ENV) : runSync();
  runner.catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
