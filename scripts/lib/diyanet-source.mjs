// Pure fetch + parse logic for the Diyanet "namazvakitleri" prayer-times page.
// No filesystem access here on purpose so this stays unit-testable.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CITY_ID = "10103";
export const LANG = "de-DE";
export const DIYANET_URL = `https://namazvakitleri.diyanet.gov.tr/${LANG}/${CITY_ID}/geislingen-an-der-steige-gebetszeiten`;

// The published page always has fewer than ~366 unique dates when it's serving
// a normal full year. Anything drastically lower means the page structure
// changed, the request failed silently, or (for a "give me next year" style
// re-check) the new year simply isn't published yet. Either way: don't merge it.
export const MIN_PLAUSIBLE_DAYS = 360;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, { timeoutMs = 25000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
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
  const { stdout } = await execFileAsync("curl", [
    "-L",
    "-A",
    USER_AGENT,
    "-H",
    "Accept-Language: de-DE,de;q=0.9,en;q=0.8,tr;q=0.7",
    "-H",
    "Cache-Control: no-cache",
    url,
  ]);
  return stdout;
}

// Retries + curl fallback (useful on Windows machines where outbound fetch()
// occasionally gets blocked/throttled but curl still gets through).
export async function fetchDiyanetHtml(url = DIYANET_URL, { tries = 4 } = {}) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetchWithTimeout(url);
    } catch (e) {
      if (i === tries) break;
      await sleep(1200 * i);
    }
  }

  return await fetchViaCurl(url);
}

function ddmmyyyyToIso(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split(".");
  return `${yyyy}-${mm}-${dd}`;
}

// The page renders each field in its own <td> (weekly / monthly / yearly
// tables all share the same "date, hijri date, 6x HH:MM" tail). A regex
// written against the raw HTML sees tag soup between fields, not whitespace,
// so tags must be stripped first or the match count silently comes back 0.
const ROW_RE =
  /(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/g;

// Returns { [isoDate]: { hijri, fajr, sunrise, dhuhr, asr, maghrib, isha } }.
// The page repeats the same dates across its weekly/monthly/yearly tabs;
// later matches simply overwrite earlier (identical) ones.
export function parseDiyanetHtml(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

  const rows = {};
  for (const m of text.matchAll(ROW_RE)) {
    const iso = ddmmyyyyToIso(m[1]);
    rows[iso] = {
      hijri: m[2].replace(/\s+/g, " ").trim(),
      fajr: m[3],
      sunrise: m[4],
      dhuhr: m[5],
      asr: m[6],
      maghrib: m[7],
      isha: m[8],
    };
  }
  return rows;
}

export function isPlausible(rows, minDays = MIN_PLAUSIBLE_DAYS) {
  return Object.keys(rows).length >= minDays;
}
