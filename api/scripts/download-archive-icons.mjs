import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const APPS_FILE = path.resolve("src/data/apps.generated.ts");
const ICONS_DIR = path.resolve("src/data/icons");
const MISSING_FILE = path.join(ICONS_DIR, "missing.txt");
const EXPORT_NAME = "generatedStoreApps";
const CURRENT_YEAR = new Date().getUTCFullYear();
const DEFAULT_YEAR = Number.parseInt(
  process.env.PLAY_ARCHIVE_YEAR ?? "2013",
  10,
);
const DEFAULT_CONCURRENCY = Number.parseInt(
  process.env.PLAY_ARCHIVE_CONCURRENCY ?? "100",
  10,
);
const DEFAULT_RETRY_COUNT = Number.parseInt(
  process.env.PLAY_ARCHIVE_RETRIES ?? "4",
  10,
);
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_TIMEOUT_MS ?? "20000",
  10,
);
const CDX_CALLS_PER_SECOND = Number.parseFloat(
  process.env.PLAY_ARCHIVE_CDX_CALLS_PER_SECOND ?? "0.75",
);
const PAGE_CALLS_PER_SECOND = Number.parseFloat(
  process.env.PLAY_ARCHIVE_PAGE_CALLS_PER_SECOND ?? "2",
);
const IMAGE_CALLS_PER_SECOND = Number.parseFloat(
  process.env.PLAY_ARCHIVE_IMAGE_CALLS_PER_SECOND ?? "4",
);
const DEFAULT_RATE_LIMIT_DELAY_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_RATE_LIMIT_DELAY_MS ?? "60000",
  10,
);
const MAX_RATE_LIMIT_DELAY_MS = Number.parseInt(
  process.env.PLAY_ARCHIVE_MAX_RATE_LIMIT_DELAY_MS ?? "900000",
  10,
);
const USER_AGENT =
  process.env.PLAY_ARCHIVE_USER_AGENT ??
  "play-google-api-archive-icons/1.0 (+local script)";

function emptyAppsModule() {
  return [
    'import type { AppData } from "./apps";',
    "",
    "// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.",
    `// Generated at: ${new Date().toISOString()}`,
    "",
    `export const ${EXPORT_NAME}: AppData[] = [];`,
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    year: DEFAULT_YEAR,
    timestamp: "",
    limit: 0,
    force: false,
    concurrency: DEFAULT_CONCURRENCY,
    packages: [],
  };

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg.startsWith("--year=")) {
      options.year = Number.parseInt(arg.slice("--year=".length), 10);
      continue;
    }

    if (arg.startsWith("--timestamp=")) {
      options.timestamp = arg.slice("--timestamp=".length).trim();
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10);
      continue;
    }

    if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number.parseInt(
        arg.slice("--concurrency=".length),
        10,
      );
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
    }
  }

  return options;
}

function assertTargetYear(year) {
  if (!Number.isInteger(year) || year < 2013 || year > CURRENT_YEAR) {
    throw new Error(
      `Archive year must be between 2013 and ${CURRENT_YEAR}. Got: ${year}`,
    );
  }
}

function resolveTimestamp(options) {
  const timestamp = String(options.timestamp ?? "").trim();
  if (!timestamp) return "";

  if (!/^\d{14}$/.test(timestamp)) {
    throw new Error(
      `Archive timestamp must be 14 digits (YYYYMMDDhhmmss). Got: ${timestamp || "<empty>"}`,
    );
  }

  const timestampYear = Number.parseInt(timestamp.slice(0, 4), 10);
  if (timestampYear !== options.year) {
    throw new Error(
      `--timestamp year (${timestampYear}) must match --year (${options.year}).`,
    );
  }

  return timestamp;
}

function buildArchivePlan(options) {
  return [{ year: options.year, timestamp: resolveTimestamp(options) }];
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

  return JSON.parse(sourceText.slice(start, end + 1));
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
    }
  }

  return -1;
}

async function loadPackageIds(sourcePath) {
  await mkdir(path.dirname(sourcePath), { recursive: true });
  let source = "";
  try {
    source = await readFile(sourcePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    source = emptyAppsModule();
    await writeFile(sourcePath, source, "utf8");
  }
  const apps = parseGeneratedArray(source, EXPORT_NAME);
  const ids = [];
  const seen = new Set();

  for (const app of apps) {
    const id = String(app?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
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

async function fetchSnapshotTimestamps(packageId, year) {
  const detailsUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}`;
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(detailsUrl)}` +
    `&from=${year}&to=${year}&output=json&fl=timestamp&filter=statuscode:200&filter=mimetype:text/html&collapse=digest`;

  const response = await fetchArchive(
    cdxUrl,
    `cdx:${packageId}:${year}`,
    "cdx",
  );
  const rows = JSON.parse(await response.text());
  if (!Array.isArray(rows) || rows.length <= 1) return [];

  return rows
    .slice(1)
    .map((row) => String(row[0] ?? ""))
    .filter((timestamp) => /^\d{14}$/.test(timestamp))
    .sort((left, right) => left.localeCompare(right));
}

function chooseSnapshotTimestamp(timestamps, preferredTimestamp = "") {
  if (!Array.isArray(timestamps) || timestamps.length === 0) return "";
  if (!/^\d{14}$/.test(String(preferredTimestamp))) return timestamps[0];

  const preferred = Number.parseInt(preferredTimestamp, 10);
  return [...timestamps].sort((left, right) => {
    const leftDelta = Math.abs(Number.parseInt(left, 10) - preferred);
    const rightDelta = Math.abs(Number.parseInt(right, 10) - preferred);
    return leftDelta - rightDelta || left.localeCompare(right);
  })[0];
}

function buildSnapshotProbeOrder(timestamps, preferredTimestamp = "") {
  if (!Array.isArray(timestamps) || timestamps.length === 0) return [];
  const nearest = chooseSnapshotTimestamp(timestamps, preferredTimestamp);
  const ordered = [];
  const seen = new Set();
  const push = (value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    ordered.push(value);
  };
  push(nearest);
  for (const value of timestamps) {
    push(value);
  }
  return ordered;
}

function archivePageUrl(packageId, timestamp) {
  const detailsUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}`;
  return `https://web.archive.org/web/${timestamp}/${detailsUrl}`;
}

function extractWaybackTimestamp(url) {
  const match = String(url).match(/\/web\/(\d{14})(?:im_)?\//);
  return match?.[1] ?? "";
}

function normalizeArchiveUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("https://web.archive.org/")) return raw;
  if (raw.startsWith("//web.archive.org/")) return `https:${raw}`;
  if (raw.startsWith("/web/")) return `https://web.archive.org${raw}`;
  return raw;
}

function extractCoverImageUrl(html) {
  const classMatch = html.match(
    /<img\b[^>]*class="[^"]*\bcover-image\b[^"]*"[^>]*src="([^"]+)"/i,
  );
  if (classMatch?.[1]) return normalizeArchiveUrl(classMatch[1]);

  const itemPropMatch = html.match(
    /<img\b[^>]*itemprop="image"[^>]*src="([^"]+)"/i,
  );
  if (itemPropMatch?.[1]) return normalizeArchiveUrl(itemPropMatch[1]);

  const reverseItemPropMatch = html.match(
    /<img\b[^>]*src="([^"]+)"[^>]*itemprop="image"/i,
  );
  if (reverseItemPropMatch?.[1]) {
    return normalizeArchiveUrl(reverseItemPropMatch[1]);
  }

  return "";
}

function assertArchiveYear(url, year, kind) {
  const timestamp = extractWaybackTimestamp(url);
  if (!timestamp) {
    throw new Error(`Unable to detect archive timestamp for ${kind}: ${url}`);
  }

  if (!timestamp.startsWith(String(year))) {
    throw new Error(
      `${kind} resolved outside the requested year ${year}: ${timestamp}`,
    );
  }

  return timestamp;
}

function assertImAsset(url) {
  if (!/\/web\/\d{14}im_\//.test(url)) {
    throw new Error(`Expected a Wayback im_ asset URL, got: ${url}`);
  }
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

function buildImageUrlVariants(imageUrl) {
  const variants = [];
  const seen = new Set();
  const push = (value) => {
    const normalized = normalizeArchiveUrl(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    variants.push(normalized);
  };

  push(imageUrl);

  try {
    const parsed = new URL(String(imageUrl ?? ""));
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

async function fetchValidatedImageBinary(url, label) {
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

async function findExistingIconBase(packageId) {
  const knownExtensions = [
    ".avif",
    ".png",
    ".svg",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
  ];
  for (const extension of knownExtensions) {
    const filePath = path.join(ICONS_DIR, `${packageId}${extension}`);
    try {
      const info = await stat(filePath);
      if (info.isFile()) return filePath;
    } catch {}
  }
  return "";
}

async function saveArchiveIcon(packageId, year, preferredTimestamp, force) {
  await mkdir(ICONS_DIR, { recursive: true });

  const existing = await findExistingIconBase(packageId);
  if (existing && !force) {
    return { status: "skipped", packageId, filePath: existing };
  }

  const timestamps = await fetchSnapshotTimestamps(packageId, year);
  const probeOrder = buildSnapshotProbeOrder(timestamps, preferredTimestamp);
  if (probeOrder.length === 0) {
    throw new Error(`no archived page found for ${packageId} in ${year}`);
  }

  const failures = [];
  for (const chosenTimestamp of probeOrder) {
    try {
      const page = await fetchText(
        archivePageUrl(packageId, chosenTimestamp),
        `page:${packageId}`,
        "page",
      );
      const pageTimestamp = assertArchiveYear(
        page.finalUrl,
        year,
        `page:${packageId}`,
      );
      const imageUrl = extractCoverImageUrl(page.text);
      if (!imageUrl) {
        failures.push(`${chosenTimestamp}:cover-image not found`);
        continue;
      }

      assertArchiveYear(imageUrl, year, `image:${packageId}`);
      assertImAsset(imageUrl);

      let image = null;
      const imageCandidates = buildImageUrlVariants(imageUrl);
      for (const candidate of imageCandidates) {
        try {
          image = await fetchValidatedImageBinary(
            candidate,
            `image:${packageId}`,
          );
          break;
        } catch (error) {
          failures.push(
            `${chosenTimestamp}:${candidate}:${error?.message ?? String(error)}`,
          );
        }
      }

      if (!image) continue;

      const extension = detectExtension(image.finalUrl, image.contentType);
      const filePath = path.join(ICONS_DIR, `${packageId}${extension}`);
      await writeFile(filePath, image.bytes);

      return {
        status: "saved",
        packageId,
        filePath,
        pageTimestamp,
        imageTimestamp: extractWaybackTimestamp(imageUrl),
        imageUrl,
      };
    } catch (error) {
      failures.push(`${chosenTimestamp}:${error?.message ?? String(error)}`);
    }
  }

  throw new Error(
    `image download failed for ${packageId}: ${failures.join(" | ")}`,
  );
}

function isMissingArchiveError(message) {
  const text = String(message ?? "").toLowerCase();
  return (
    text.includes("no archived page found") ||
    text.includes("failed with 404") ||
    text.includes("cover-image not found") ||
    text.includes("resolved outside the requested year") ||
    text.includes("unable to detect archive timestamp") ||
    text.includes("expected a wayback im_ asset url")
  );
}

async function saveArchiveIconWithFallback(packageId, plan, force) {
  const failures = [];

  for (const attempt of plan) {
    try {
      const result = await saveArchiveIcon(
        packageId,
        attempt.year,
        attempt.timestamp,
        force,
      );
      return { ...result, resolvedYear: attempt.year };
    } catch (error) {
      failures.push({
        year: attempt.year,
        message: error?.message ?? String(error),
      });
    }
  }

  const allMissing =
    failures.length > 0 &&
    failures.every((item) => isMissingArchiveError(item.message));
  if (allMissing) {
    return {
      status: "missing",
      packageId,
      details: failures
        .map((item) => `${item.year}:${item.message}`)
        .join(" | "),
    };
  }

  throw new Error(
    failures.map((item) => `${item.year}:${item.message}`).join(" | "),
  );
}

async function runPool(items, concurrency, worker) {
  const queue = [...items];

  async function consume() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () =>
    consume(),
  );
  await Promise.all(workers);
}

async function writeMissingReport(missingEntries) {
  const lines = [
    `# Missing archive icons`,
    `# Generated at: ${new Date().toISOString()}`,
    `# Count: ${missingEntries.length}`,
    "",
    ...missingEntries.map((entry) => `${entry.packageId} | ${entry.details}`),
  ];
  await writeFile(MISSING_FILE, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertTargetYear(options.year);
  const plan = buildArchivePlan(options);

  await mkdir(ICONS_DIR, { recursive: true });

  let packageIds =
    options.packages.length > 0
      ? options.packages
      : await loadPackageIds(APPS_FILE);
  if (options.limit > 0) {
    packageIds = packageIds.slice(0, options.limit);
  }

  console.log(
    `[archive-icons] packages=${packageIds.length} years=${plan.map((item) => item.year).join("->")} timestamps=${plan.map((item) => item.timestamp || "<auto>").join("->")} concurrency=${options.concurrency} cdx_rps=${CDX_CALLS_PER_SECOND} page_rps=${PAGE_CALLS_PER_SECOND} image_rps=${IMAGE_CALLS_PER_SECOND} force=${options.force}`,
  );

  const summary = {
    saved: 0,
    skipped: 0,
    failed: 0,
  };
  const missingEntries = [];

  await runPool(packageIds, options.concurrency, async (packageId) => {
    try {
      const result = await saveArchiveIconWithFallback(
        packageId,
        plan,
        options.force,
      );
      if (result.status === "skipped") {
        summary.skipped += 1;
        console.log(`[skip] ${packageId} -> ${result.filePath}`);
        return;
      }

      if (result.status === "missing") {
        summary.skipped += 1;
        missingEntries.push({ packageId, details: result.details });
        console.log(
          `[skip] ${packageId} -> no archive icon in requested years (${result.details})`,
        );
        return;
      }

      summary.saved += 1;
      console.log(
        `[saved] ${packageId} -> ${result.filePath} (year=${result.resolvedYear}, page=${result.pageTimestamp}, image=${result.imageTimestamp})`,
      );
    } catch (error) {
      summary.failed += 1;
      console.warn(`[failed] ${packageId}: ${error.message}`);
    }
  });

  await writeMissingReport(missingEntries);

  console.log(
    `[archive-icons] done saved=${summary.saved} skipped=${summary.skipped} failed=${summary.failed} missing_report=${MISSING_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
