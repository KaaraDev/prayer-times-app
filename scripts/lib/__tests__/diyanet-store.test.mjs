import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  mergeRows,
  groupByYear,
  updateStableFile,
  updateArchive,
  readJsonSafe,
  STABLE_FILENAME,
} from "../diyanet-store.mjs";

describe("mergeRows", () => {
  it("upserts new dates without dropping existing ones", () => {
    const existing = { "2025-12-31": { fajr: "06:00" } };
    const { merged, changed } = mergeRows(existing, { "2026-01-01": { fajr: "06:18" } });

    expect(merged).toEqual({
      "2025-12-31": { fajr: "06:00" },
      "2026-01-01": { fajr: "06:18" },
    });
    expect(changed).toBe(1);
  });

  it("counts unchanged dates as zero changes", () => {
    const existing = { "2026-01-01": { fajr: "06:18" } };
    const { changed } = mergeRows(existing, { "2026-01-01": { fajr: "06:18" } });
    expect(changed).toBe(0);
  });

  it("overwrites a changed date and counts it", () => {
    const existing = { "2026-01-01": { fajr: "06:18" } };
    const { merged, changed } = mergeRows(existing, { "2026-01-01": { fajr: "06:19" } });
    expect(merged["2026-01-01"].fajr).toBe("06:19");
    expect(changed).toBe(1);
  });
});

describe("groupByYear", () => {
  it("buckets rows by the year in their ISO date", () => {
    const grouped = groupByYear({
      "2026-12-31": { fajr: "a" },
      "2027-01-01": { fajr: "b" },
    });
    expect(Object.keys(grouped).sort()).toEqual(["2026", "2027"]);
    expect(grouped["2027"]["2027-01-01"].fajr).toBe("b");
  });
});

describe("filesystem-backed store", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "diyanet-store-test-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("creates the stable file on first write and merges on subsequent writes", async () => {
    await updateStableFile(dir, { "2026-01-01": { fajr: "06:18" } });
    let data = await readJsonSafe(path.join(dir, STABLE_FILENAME));
    expect(data["2026-01-01"].fajr).toBe("06:18");

    await updateStableFile(dir, { "2026-01-02": { fajr: "06:18" } });
    data = await readJsonSafe(path.join(dir, STABLE_FILENAME));
    expect(Object.keys(data).sort()).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("archives rows into per-year files", async () => {
    await updateArchive(dir, {
      "2026-12-31": { fajr: "06:18" },
      "2027-01-01": { fajr: "06:19" },
    });

    const y2026 = await readJsonSafe(path.join(dir, "diyanet-geislingen-2026.json"));
    const y2027 = await readJsonSafe(path.join(dir, "diyanet-geislingen-2027.json"));
    expect(y2026).toEqual({ "2026-12-31": { fajr: "06:18" } });
    expect(y2027).toEqual({ "2027-01-01": { fajr: "06:19" } });
  });

  it("readJsonSafe returns an empty object for a missing file", async () => {
    const data = await readJsonSafe(path.join(dir, "does-not-exist.json"));
    expect(data).toEqual({});
  });
});
