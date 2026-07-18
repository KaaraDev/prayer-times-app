import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MIN_PLAUSIBLE_DAYS } from "../diyanet-source.mjs";

vi.mock("../diyanet-source.mjs", async () => {
  const actual = await vi.importActual("../diyanet-source.mjs");
  return { ...actual, fetchDiyanetHtml: vi.fn() };
});

const { fetchDiyanetHtml } = await import("../diyanet-source.mjs");
const { runDiyanetWarmerOnce } = await import("../diyanet-warmer.mjs");
const { readJsonSafe, STABLE_FILENAME } = await import("../diyanet-store.mjs");

function fullYearHtml(year) {
  let rows = "";
  const date = new Date(Date.UTC(year, 0, 1));
  for (let i = 0; i < MIN_PLAUSIBLE_DAYS; i++) {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const y = date.getUTCFullYear();
    rows += `<tr><td>${day}.${month}.${y}</td><td>1 Muharrem 144${i % 9}</td><td>06:1${i % 9}</td><td>08:0${i % 9}</td><td>12:2${i % 9}</td><td>14:2${i % 9}</td><td>16:4${i % 9}</td><td>18:1${i % 9}</td></tr>`;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return `<table><tbody>${rows}</tbody></table>`;
}

describe("runDiyanetWarmerOnce", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "diyanet-warmer-test-"));
    fetchDiyanetHtml.mockReset();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("skips the write when the page returns too few rows (not-yet-published state)", async () => {
    fetchDiyanetHtml.mockResolvedValue("<table><tbody><tr><td>01.01.2027</td></tr></tbody></table>");

    const result = await runDiyanetWarmerOnce({ dirs: [dir] });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-enough-rows");
    const data = await readJsonSafe(path.join(dir, STABLE_FILENAME));
    expect(data).toEqual({});
  });

  it("does not throw when the fetch itself fails", async () => {
    fetchDiyanetHtml.mockRejectedValue(new Error("network down"));

    const result = await runDiyanetWarmerOnce({ dirs: [dir] });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("fetch-failed");
  });

  it("merges a plausible full-year response into the stable file and archive", async () => {
    fetchDiyanetHtml.mockResolvedValue(fullYearHtml(2026));

    const result = await runDiyanetWarmerOnce({ dirs: [dir] });

    expect(result.ok).toBe(true);
    expect(result.dayCount).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_DAYS);

    const stable = await readJsonSafe(path.join(dir, STABLE_FILENAME));
    expect(Object.keys(stable).length).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_DAYS);

    const archived = await readJsonSafe(path.join(dir, "diyanet-archive", "diyanet-geislingen-2026.json"));
    expect(Object.keys(archived).length).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_DAYS);
  });

  it("writes the same merged data to every target directory", async () => {
    const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), "diyanet-warmer-test2-"));
    fetchDiyanetHtml.mockResolvedValue(fullYearHtml(2026));

    await runDiyanetWarmerOnce({ dirs: [dir, dir2] });

    const a = await readJsonSafe(path.join(dir, STABLE_FILENAME));
    const b = await readJsonSafe(path.join(dir2, STABLE_FILENAME));
    expect(a).toEqual(b);

    await fs.rm(dir2, { recursive: true, force: true });
  });
});
