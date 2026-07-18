// Orchestration: fetch -> parse -> sanity check -> merge -> persist.
// Used both by the Vite dev/preview plugin (vite.config.js) and by the
// standalone CLI/daemon scripts. Never throws - callers get a result object
// back and log/report it however fits their context.

import path from "node:path";
import { DIYANET_URL, fetchDiyanetHtml, parseDiyanetHtml, isPlausible } from "./diyanet-source.mjs";
import { updateStableFile, updateArchive, ARCHIVE_DIRNAME } from "./diyanet-store.mjs";

export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h - this data isn't time-sensitive

// dirs: one or more directories that should each end up with an up-to-date
// stable JSON file (e.g. publicDir for `vite`, and the build outDir for
// `vite preview` so a fresh scrape shows up without a rebuild).
export async function runDiyanetWarmerOnce({ dirs, url = DIYANET_URL } = {}) {
  if (!dirs || dirs.length === 0) throw new Error("runDiyanetWarmerOnce: at least one dir is required");

  let html;
  try {
    html = await fetchDiyanetHtml(url);
  } catch (e) {
    return { ok: false, reason: "fetch-failed", error: String(e?.message || e) };
  }

  const rows = parseDiyanetHtml(html);
  const dayCount = Object.keys(rows).length;

  if (!isPlausible(rows)) {
    // Expected state, not an error: e.g. Diyanet hasn't rolled the page over
    // to next year's calendar yet. Skip the write and let the next tick retry.
    return { ok: false, reason: "not-enough-rows", dayCount };
  }

  const results = await Promise.all(dirs.map((dir) => updateStableFile(dir, rows)));
  const archiveResults = await updateArchive(path.join(dirs[0], ARCHIVE_DIRNAME), rows);

  return {
    ok: true,
    dayCount,
    stable: results,
    archive: archiveResults,
  };
}

export function formatResult(result) {
  if (result.ok) {
    const changedTotal = result.stable.reduce((sum, r) => sum + r.changed, 0);
    const years = result.archive.map((a) => a.year).join(", ") || "-";
    return `diyanet warmer: ok, ${result.dayCount} days parsed, ${changedTotal} day(s) changed, years touched: ${years}`;
  }
  if (result.reason === "not-enough-rows") {
    return `diyanet warmer: skipped, only ${result.dayCount} day(s) in response (page likely not rolled over yet)`;
  }
  return `diyanet warmer: failed (${result.reason}): ${result.error ?? ""}`;
}

// Runs once immediately, then on a fixed interval, forever. Failures are
// caught per-tick so one bad fetch never kills the background job.
export function startDiyanetWarmer({ dirs, intervalMs = DEFAULT_INTERVAL_MS, log = console.log } = {}) {
  const tick = async () => {
    try {
      const result = await runDiyanetWarmerOnce({ dirs });
      log(formatResult(result));
    } catch (e) {
      log(`diyanet warmer: unexpected error, will retry next tick: ${String(e?.message || e)}`);
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
