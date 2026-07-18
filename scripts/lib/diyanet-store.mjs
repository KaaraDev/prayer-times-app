// Filesystem side of the Diyanet pipeline: merging freshly scraped rows into
// one stable, permanent JSON file (so the app never has to know what year it
// is) plus a per-year archive for history/debugging.

import fs from "node:fs/promises";
import path from "node:path";

export const STABLE_FILENAME = "diyanet-geislingen.json";
export const ARCHIVE_DIRNAME = "diyanet-archive";

export async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Write via a temp file + rename so a concurrent request never sees a
// half-written file (Vite serves this path directly as a static asset).
export async function atomicWriteJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

// Upsert: new rows win on conflicting dates, everything else is kept as-is.
// This is what makes year-boundary lookups (e.g. "next Friday" in late
// December) safe - old years never get dropped just because the latest
// scrape only returned the current year's table.
export function mergeRows(existing, newRows) {
  const merged = { ...existing };
  let changed = 0;
  for (const [date, entry] of Object.entries(newRows)) {
    const prev = merged[date];
    if (!prev || JSON.stringify(prev) !== JSON.stringify(entry)) changed++;
    merged[date] = entry;
  }
  return { merged, changed };
}

export function groupByYear(rows) {
  const byYear = {};
  for (const [date, entry] of Object.entries(rows)) {
    const year = date.slice(0, 4);
    (byYear[year] ??= {})[date] = entry;
  }
  return byYear;
}

export async function updateStableFile(dir, newRows) {
  const filePath = path.join(dir, STABLE_FILENAME);
  const existing = await readJsonSafe(filePath);
  const { merged, changed } = mergeRows(existing, newRows);
  if (changed > 0) await atomicWriteJson(filePath, merged);
  return { filePath, changed, total: Object.keys(merged).length };
}

export async function updateArchive(archiveDir, newRows) {
  const byYear = groupByYear(newRows);
  const results = [];
  for (const [year, yearRows] of Object.entries(byYear)) {
    const filePath = path.join(archiveDir, `diyanet-geislingen-${year}.json`);
    const existing = await readJsonSafe(filePath);
    const { merged, changed } = mergeRows(existing, yearRows);
    if (changed > 0) await atomicWriteJson(filePath, merged);
    results.push({ year, filePath, changed, total: Object.keys(merged).length });
  }
  return results;
}
