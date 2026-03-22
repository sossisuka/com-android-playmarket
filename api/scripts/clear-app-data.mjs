import { writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_APPS_FILE = path.resolve("src/data/apps.generated.ts");
const OUT_CATEGORIES_FILE = path.resolve("src/data/playCategories.generated.ts");

function asAppsModule() {
  return `import type { AppData } from "./apps";

// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Cleared at: ${new Date().toISOString()}
// Source: scripts/clear-app-data.mjs

export const generatedStoreApps: AppData[] = [];
`;
}

function asCategoriesModule() {
  return `export type PlayCategory = { id: string; label: string };

// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.
// Cleared at: ${new Date().toISOString()}
// Source: scripts/clear-app-data.mjs

export const generatedPlayCategories: PlayCategory[] = [];
`;
}

async function main() {
  await writeFile(OUT_APPS_FILE, asAppsModule(), "utf8");
  await writeFile(OUT_CATEGORIES_FILE, asCategoriesModule(), "utf8");
  console.log("Cleared AppData and categories.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
