import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const INPUT = process.argv[2]; // z.B. "downloads/diyanet-geislingen-2026.xlsx"
const OUT_BASENAME = process.argv[3] || "diyanet-geislingen-2026"; // ohne Endung

if (!INPUT) {
  console.error("Usage: node scripts/convert-diyanet-xlsx-to-json.mjs <input.xlsx> [outBaseName]");
  process.exit(1);
}

function normTime(v) {
  // erwartet "06:14" oder "6:14" -> "06:14"
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function normDate(v) {
  // erwartet "18.01.2026" -> "2026-01-18"
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toCsv(rows) {
  const header = "date,fajr,sunrise,dhuhr,asr,maghrib,isha\n";
  const lines = rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => `${r.date},${r.fajr},${r.sunrise},${r.dhuhr},${r.asr},${r.maghrib},${r.isha}`)
    .join("\n");
  return header + lines + "\n";
}

function guessColumns(headerRow) {
  const h = headerRow.map((x) => String(x ?? "").trim().toLowerCase());

  const findIdxContains = (needles) => {
    for (let i = 0; i < h.length; i++) {
      const cell = h[i];
      if (!cell) continue;
      if (needles.some((n) => cell.includes(n))) return i;
    }
    return -1;
  };

  return {
    idxDate: findIdxContains(["gregorianischen kalender", "tarih", "datum", "date"]),
    idxFajr: findIdxContains(["morgengebet", "fastenbeginn", "imsak", "fajr"]),
    idxSunrise: findIdxContains(["sonnenaufgang", "güneş", "gunes", "sunrise"]),
    idxDhuhr: findIdxContains(["mittagsgebet", "öğle", "ogle", "dhuhr", "mittag"]),
    idxAsr: findIdxContains(["nachmittagsgebet", "ikindi", "asr", "nachmittag"]),
    idxMaghrib: findIdxContains(["abendgebet", "akşam", "aksam", "maghrib", "abend"]),
    idxIsha: findIdxContains(["nachtgebet", "yatsı", "yatsi", "isha", "nacht"]),
  };
}

async function main() {
  const abs = path.resolve(INPUT);
  const buf = await fs.readFile(abs);

  const wb = XLSX.read(buf, { type: "buffer" });

  // Nimm das erste Sheet
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // als 2D Array
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  if (!rows.length) throw new Error("XLSX scheint leer zu sein.");

    // Header finden (Zeile mit "Gregorianischen Kalender")
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const line = rows[i].map((x) => String(x ?? "").trim().toLowerCase()).join(" | ");
    if (line.includes("gregorianischen kalender")) {
        headerIndex = i;
        break;
    }
    }

    if (headerIndex === -1) {
    throw new Error("Konnte Headerzeile mit 'Gregorianischen Kalender' nicht finden.");
    }


  const headerRow = rows[headerIndex];
  const col = guessColumns(headerRow);

  // Wenn keine Header passen, fallback: Diyanet-typische Reihenfolge:
  // Datum, (Hijri), Imsak, Gunes, Ogle, Ikindi, Aksam, Yatsi
  const looksBad =
    [col.idxDate, col.idxFajr, col.idxSunrise, col.idxDhuhr, col.idxAsr, col.idxMaghrib, col.idxIsha].filter((x) => x >= 0)
      .length < 4;

  const dataRows = rows.slice(headerIndex + 1);

  const parsed = [];

  for (const r of dataRows) {
    const cells = r.map((x) => String(x).trim());

    let date = null,
      fajr = null,
      sunrise = null,
      dhuhr = null,
      asr = null,
      maghrib = null,
      isha = null;

    if (!looksBad) {
      date = normDate(cells[col.idxDate]);
      fajr = normTime(cells[col.idxFajr]);
      sunrise = normTime(cells[col.idxSunrise]);
      dhuhr = normTime(cells[col.idxDhuhr]);
      asr = normTime(cells[col.idxAsr]);
      maghrib = normTime(cells[col.idxMaghrib]);
      isha = normTime(cells[col.idxIsha]);
    } else {
      // Fallback: versuche Datum irgendwo in der Zeile zu finden
      const dateCell = cells.find((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c));
      date = dateCell ? normDate(dateCell) : null;

      // Sammle alle Zeiten
      const times = cells
        .map(normTime)
        .filter(Boolean);

      // typischerweise 6 Zeiten: imsak, gunes, ogle, ikindi, aksam, yatsi
      if (times.length >= 6) {
        [fajr, sunrise, dhuhr, asr, maghrib, isha] = times.slice(0, 6);
      }
    }

    if (!date) continue;
    if (!(fajr && sunrise && dhuhr && asr && maghrib && isha)) continue;

    parsed.push({ date, fajr, sunrise, dhuhr, asr, maghrib, isha });
  }

  if (parsed.length < 300) {
    // Debug: schreibe eine Vorschau, damit man sofort sieht, wie die XLSX aufgebaut ist
    const preview = rows.slice(headerIndex, headerIndex + 15);
    await fs.writeFile(`${OUT_BASENAME}.debug-preview.json`, JSON.stringify(preview, null, 2), "utf8");
    throw new Error(
      `Zu wenig Datensätze gefunden (${parsed.length}). Ich habe ${OUT_BASENAME}.debug-preview.json geschrieben (Vorschau der XLSX).`
    );
  }

  // JSON Mapping für deine App: YYYY-MM-DD -> {fajr:"HH:mm",...}
  const json = {};
  for (const r of parsed) {
    json[r.date] = {
      fajr: r.fajr,
      sunrise: r.sunrise,
      dhuhr: r.dhuhr,
      asr: r.asr,
      maghrib: r.maghrib,
      isha: r.isha,
    };
  }

  await fs.writeFile(`${OUT_BASENAME}.json`, JSON.stringify(json, null, 2), "utf8");
  await fs.writeFile(`${OUT_BASENAME}.csv`, toCsv(parsed), "utf8");

  console.log("✅ Konvertiert!");
  console.log(`- ${OUT_BASENAME}.json (${Object.keys(json).length} Tage)`);
  console.log(`- ${OUT_BASENAME}.csv (${parsed.length} Zeilen)`);
}

main().catch((e) => {
  console.error("❌ Fehler:", e);
  process.exit(1);
});
