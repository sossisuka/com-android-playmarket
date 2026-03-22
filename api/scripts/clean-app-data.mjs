import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APPS_FILE = path.resolve("src/data/apps.generated.ts");
const EXPORT_NAME = "generatedStoreApps";

const MOJIBAKE_REPLACEMENTS = new Map([
  ["â€™", "’"],
  ["â€˜", "‘"],
  ["â€œ", "“"],
  ["â€�", "”"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["â€¢", "•"],
  ["Â·", "·"],
  ["Â", ""],
  ["Ã—", "×"],
  ["â˜…", "★"],
]);

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

function sanitizeText(value) {
  let result = String(value ?? "");
  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    result = result.split(from).join(to);
  }
  return result
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

function sanitizeUrl(value) {
  const raw = sanitizeText(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDate(value) {
  const text = sanitizeText(value);
  if (!text) return "Unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return "Unknown";
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  const result = [];
  for (const value of values) {
    const text = sanitizeText(value);
    if (!text || unique.has(text)) continue;
    unique.add(text);
    result.push(text);
  }
  return result;
}

function normalizeScreenshots(app) {
  const source = Array.isArray(app.screenshots) ? app.screenshots : [];
  const unique = new Set();
  const screenshots = [];
  for (const item of source) {
    const url = sanitizeUrl(item);
    if (!url || unique.has(url)) continue;
    unique.add(url);
    screenshots.push(url);
    if (screenshots.length >= 8) break;
  }
  if (screenshots.length > 0) return screenshots;

  const fallbackImage = sanitizeUrl(app.image) ?? sanitizeUrl(app.icon);
  return fallbackImage ? [fallbackImage] : [];
}

function normalizeReviews(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (!Array.isArray(value)) return 0;

  const reviews = value
    .map((review, index) => {
      const author = sanitizeText(review?.author) || "User";
      const text = sanitizeText(review?.text);
      if (!text) return null;
      const stars = Math.max(1, Math.min(5, Number(review?.stars) || 5));
      return {
        id: sanitizeText(review?.id) || `r-${index + 1}`,
        author,
        text,
        stars,
        avatar: sanitizeUrl(review?.avatar) ?? "/assets/users/unnamed.png",
      };
    })
    .filter(Boolean);

  return reviews.length > 0 ? reviews : 0;
}

function normalizeRatingCountText(value) {
  const text = sanitizeText(value);
  if (!text) return "(0)";
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return "(0)";
  const number = Number.parseInt(digits, 10);
  if (Number.isNaN(number)) return "(0)";
  return `(${number.toLocaleString("en-US")})`;
}

function normalizeRelations(app, key) {
  const source = Array.isArray(app[key]) ? app[key] : [];
  const unique = new Set();
  const out = [];
  for (const id of source) {
    const text = sanitizeText(id);
    if (!text || text === app.id || unique.has(text)) continue;
    unique.add(text);
    out.push(text);
  }
  return out.slice(0, 3);
}

function cleanApps(rawApps) {
  const seen = new Set();
  const cleaned = [];

  for (const app of rawApps) {
    const id = sanitizeText(app?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const name = sanitizeText(app?.name) || id;
    const publisher = sanitizeText(app?.publisher) || "Unknown developer";
    const subtitle =
      sanitizeText(app?.subtitle) ||
      `${publisher} - ${normalizeDate(app?.updatedAt)}`;
    const category = sanitizeText(app?.category) || "APPLICATION";
    const price = sanitizeText(app?.price) || "FREE";
    const color = sanitizeText(app?.color) || "hsl(0 0% 45%)";
    const icon = sanitizeText(app?.icon) || "gamepad";
    const image =
      sanitizeUrl(app?.image) ?? sanitizeUrl(app?.icon) ?? undefined;
    const updatedAt = normalizeDate(app?.updatedAt);
    const size = sanitizeText(app?.size) || "Varies with device";
    const installs = sanitizeText(app?.installs) || "Unknown";
    const version = sanitizeText(app?.version) || "Varies with device";
    const requiresAndroid =
      sanitizeText(app?.requiresAndroid) || "Varies with device";
    const contentRating = sanitizeText(app?.contentRating) || "Everyone";
    const website = sanitizeUrl(app?.website);
    const privacyPolicy = sanitizeUrl(app?.privacyPolicy);
    const description = normalizeStringArray(app?.description);
    const whatsNew = normalizeStringArray(app?.whatsNew);
    const trailerImage = sanitizeUrl(app?.trailerImage);
    const trailerUrl = sanitizeUrl(app?.trailerUrl);
    const screenshots = normalizeScreenshots({ ...app, image, icon });
    const ratingValue = Math.max(0, Math.min(5, Number(app?.ratingValue) || 0));
    const ratingCountText = normalizeRatingCountText(app?.ratingCountText);
    const reviews = normalizeReviews(app?.reviews);

    cleaned.push({
      id,
      name,
      publisher,
      subtitle,
      category,
      price,
      color,
      icon,
      image,
      updatedAt,
      size,
      installs,
      version,
      requiresAndroid,
      contentRating,
      website,
      privacyPolicy,
      description:
        description.length > 0 ? description : ["No description provided."],
      whatsNew:
        whatsNew.length > 0 ? whatsNew : ["Data refreshed from Google Play."],
      trailerImage,
      trailerUrl,
      screenshots,
      ratingValue,
      ratingCountText,
      reviews,
      similarIds: normalizeRelations({ ...app, id }, "similarIds"),
      moreFromDeveloperIds: normalizeRelations(
        { ...app, id },
        "moreFromDeveloperIds",
      ),
    });
  }

  const ids = new Set(cleaned.map((app) => app.id));
  return cleaned.map((app) => ({
    ...app,
    similarIds: app.similarIds.filter((id) => ids.has(id)).slice(0, 3),
    moreFromDeveloperIds: app.moreFromDeveloperIds
      .filter((id) => ids.has(id))
      .slice(0, 3),
  }));
}

function asAppsModule(apps) {
  return `import type { AppData } from "./apps";

// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Cleaned at: ${new Date().toISOString()}
// Source: scripts/clean-app-data.mjs

export const generatedStoreApps: AppData[] = ${JSON.stringify(apps, null, 2)};
`;
}

async function main() {
  const text = await readFile(APPS_FILE, "utf8");
  const parsed = parseGeneratedArray(text, EXPORT_NAME);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      "No generatedStoreApps array found in src/data/apps.generated.ts",
    );
  }

  const cleaned = cleanApps(parsed);
  await writeFile(APPS_FILE, asAppsModule(cleaned), "utf8");
  console.log(`Cleaned AppData: ${parsed.length} -> ${cleaned.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
