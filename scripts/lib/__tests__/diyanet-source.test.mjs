import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDiyanetHtml, isPlausible, MIN_PLAUSIBLE_DAYS } from "../diyanet-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtml = await fs.readFile(
  path.join(__dirname, "..", "__fixtures__", "diyanet-sample.html"),
  "utf8"
);

describe("parseDiyanetHtml", () => {
  it("parses rows out of tag-stripped HTML, including the weekly table's extra leading columns", () => {
    const rows = parseDiyanetHtml(fixtureHtml);

    expect(rows["2026-07-18"]).toEqual({
      hijri: "4 Safer 1448",
      fajr: "03:52",
      sunrise: "05:30",
      dhuhr: "13:32",
      asr: "17:43",
      maghrib: "21:24",
      isha: "22:44",
    });
  });

  it("captures the hijri date alongside the gregorian one", () => {
    const rows = parseDiyanetHtml(fixtureHtml);
    expect(rows["2026-01-01"].hijri).toBe("12 Recep 1447");
    expect(rows["2026-12-31"].hijri).toBe("22 Recep 1448");
  });

  it("parses the full set of distinct dates in the fixture", () => {
    const rows = parseDiyanetHtml(fixtureHtml);
    expect(Object.keys(rows).sort()).toEqual(["2026-01-01", "2026-01-02", "2026-07-18", "2026-12-31"]);
  });

  it("returns an empty object for HTML with no matching rows", () => {
    expect(parseDiyanetHtml("<html><body>no data here</body></html>")).toEqual({});
  });
});

describe("isPlausible", () => {
  it("rejects a near-empty result (e.g. new year not published yet)", () => {
    const rows = { "2027-01-01": {} };
    expect(isPlausible(rows)).toBe(false);
  });

  it("accepts a result with a full year of days", () => {
    const rows = {};
    for (let i = 0; i < MIN_PLAUSIBLE_DAYS; i++) rows[`2026-01-${i}`] = {};
    expect(isPlausible(rows)).toBe(true);
  });
});
