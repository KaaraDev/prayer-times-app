// scripts/fetch-diyanet-geislingen-2026.mjs
// Robust: Retries + Timeout + curl-fallback (Windows).

import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CITY_ID = "10103";
const LANG = "de-DE";
const YEAR = 2026;

const URL = `https://namazvakitleri.diyanet.gov.tr/${LANG}/${CITY_ID}/geislingen-an-der-steige-gebetszeiten`;

function ddmmyyyyToIso(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split(".");
  return `${yyyy}-${mm}-${dd}`;
}

function toCsv(rows) {
  const header = "date,fajr,sunrise,dhuhr,asr,maghrib,isha\n";
  const lines = rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => `${r.date},${r.fajr},${r.sunrise},${r.dhuhr},${r.asr},${r.maghrib},${r.isha}`)
    .join("\n");
  return header + lines + "\n";
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, { timeoutMs = 20000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8,tr;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchViaCurl(url) {
  // -L follow redirects
  // -A user-agent
  const { stdout } = await execFileAsync("curl", [
    "-L",
    "-A",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
    "-H",
    "Accept-Language: de-DE,de;q=0.9,en;q=0.8,tr;q=0.7",
    "-H",
    "Cache-Control: no-cache",
    url,
  ]);
  return stdout;
}

async function getHtml(url) {
  const tries = 4;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetchWithTimeout(url, { timeoutMs: 25000 });
    } catch (e) {
      const msg = String(e?.message || e);
      console.warn(`⚠️ fetch Versuch ${i}/${tries} fehlgeschlagen: ${msg}`);
      if (i < tries) await sleep(1200 * i);
    }
  }

  console.warn("↪️ Fallback: versuche Download via curl …");
  return await fetchViaCurl(url);
}

async function main() {
  const html = await getHtml(URL);

  // Robust: Datum + 6 Zeiten (HH:MM) in einer Zeile
  const re =
    /(\d{2}\.\d{2}\.\d{4})[\s\S]{0,120}?(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/g;

  const rows = [];
  for (const m of html.matchAll(re)) {
    const dateIso = ddmmyyyyToIso(m[1]);
    if (!dateIso.startsWith(String(YEAR))) continue;

    rows.push({
      date: dateIso,
      fajr: m[2],     // İmsak (Fastenbeginn)
      sunrise: m[3],
      dhuhr: m[4],
      asr: m[5],
      maghrib: m[6],
      isha: m[7],
    });
  }

  const uniq = new Map();
  for (const r of rows) uniq.set(r.date, r);
  const finalRows = [...uniq.values()];

  if (finalRows.length < 360) {
    // Debug-Hilfe: HTML speichern
    await fs.writeFile("debug-diyanet.html", html, "utf8");
    throw new Error(
      `Zu wenig Tage gefunden (${finalRows.length}). Ich habe debug-diyanet.html gespeichert – wahrscheinlich HTML geändert.`
    );
  }

  const json = {};
  for (const r of finalRows) {
    json[r.date] = {
      fajr: r.fajr,
      sunrise: r.sunrise,
      dhuhr: r.dhuhr,
      asr: r.asr,
      maghrib: r.maghrib,
      isha: r.isha,
    };
  }

  const outJson = `diyanet-geislingen-${YEAR}.json`;
  const outCsv = `diyanet-geislingen-${YEAR}.csv`;

  await fs.writeFile(outJson, JSON.stringify(json, null, 2), "utf8");
  await fs.writeFile(outCsv, toCsv(finalRows), "utf8");

  console.log("✅ Fertig!");
  console.log(`- ${outJson} (${Object.keys(json).length} Tage)`);
  console.log(`- ${outCsv} (${finalRows.length} Zeilen)`);
  console.log(`Quelle: ${URL}`);
}

main().catch((e) => {
  console.error("❌ Fehler:", e);
  process.exit(1);
});
