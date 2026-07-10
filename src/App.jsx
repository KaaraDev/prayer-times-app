import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import localizedFormat from "dayjs/plugin/localizedFormat";
import duration from "dayjs/plugin/duration";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "dayjs/locale/de";
import * as adhan from "adhan";

// UI / icons / animation
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Settings, Maximize2, MapPin, Clock, Quote, Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(duration);
dayjs.extend(isSameOrBefore);
dayjs.locale("de");

const DEFAULT_TZ = "Europe/Berlin";
const PRAYER_ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

const LABELS = {
  fajr: { tr: "İmsak", ar: "Fajr" },
  sunrise: { tr: "Güneş", ar: "Shuruq" },
  dhuhr: { tr: "Öğle", ar: "Dhuhr" },
  asr: { tr: "İkindi", ar: "Asr" },
  maghrib: { tr: "Akşam", ar: "Maghrib" },
  isha: { tr: "Yatsı", ar: "Isha" },
};

// Kuratierte Auswahl bekannter, für die Anzeige geeigneter Koranverse (Surah:Ayah).
// Ersetzt die vollständig zufällige Auswahl (1-6236) durch eine handverlesene Liste.
// Nur kurze Verse (max. ~50 Wörter), damit sie gut lesbar auf dem Display Platz finden.
const CURATED_AYAHS = [
  "2:152", "2:153", "2:186", "13:28", "20:8", "20:14", "29:45", "31:17",
  "33:41", "39:53", "51:56", "65:3", "87:14", "87:15", "94:5",
  "103:1", "103:2", "103:3",
];

// Kuratierte Hadith-IDs von hadeethenc.com (Kategorie "Guter Charakter und Benehmen"),
// verifiziert mit deutscher Übersetzung. Nur kurze Kernaussagen (max. ~50 Wörter).
const CURATED_HADITHS = [
  "66518", "66520", "66521", "66526", "66541", "3017", "3567", "3591",
  "3701", "3716", "4191", "4302", "4555", "4709",
];

const toDateWithTime = (baseDate, hhmm, tz = DEFAULT_TZ) => {
  const dateStr = dayjs(baseDate).format("YYYY-MM-DD");
  return dayjs.tz(`${dateStr} ${hhmm}`, "YYYY-MM-DD HH:mm", tz);
};
const fmt = (d, tz = DEFAULT_TZ) => (d ? dayjs(d).tz(tz).format("HH:mm") : "--:--");

const fittedMosqueTitleStyle = {
  fontSize: "clamp(2rem, 2.35vw, 3rem)",
  lineHeight: 1.08,
  overflowWrap: "anywhere",
};

// Mondphase (0 = Neumond, 0.5 = Vollmond, 1 = Neumond) für ein beliebiges Datum
const getMoonPhase = (date) => {
  const SYNODIC = 29.53058867; // Länge eines Mondzyklus in Tagen
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14); // bekannter Neumond
  let p = (((date.getTime() - knownNewMoon) / 86400000) % SYNODIC) / SYNODIC;
  if (p < 0) p += 1;
  return p;
};

const MOON_PHASE_NAMES = [
  "Neumond",
  "Zunehmende Sichel",
  "Erstes Viertel",
  "Zunehmender Mond",
  "Vollmond",
  "Abnehmender Mond",
  "Letztes Viertel",
  "Abnehmende Sichel",
];

const getMoonPhaseName = (phase) => {
  // 8 Phasen, zentriert um die Eckpunkte
  const idx = Math.round(phase * 8) % 8;
  return MOON_PHASE_NAMES[idx];
};

// Geometrie der Mondphase: liefert SVG-Pfade für die beleuchtete und die unbeleuchtete Fläche
const moonGeometry = (phase, R, cx, cy) => {
  const f = (1 - Math.cos(phase * 2 * Math.PI)) / 2; // beleuchteter Anteil 0..1
  const rx = R * Math.abs(1 - 2 * f);                // horizontale Halbachse des Terminators
  const top = `${cx} ${cy - R}`;
  const bot = `${cx} ${cy + R}`;
  const waxing = phase <= 0.5;                        // zunehmend = rechts beleuchtet (Nordhalbkugel)
  const term = waxing ? (f <= 0.5 ? 0 : 1) : (f <= 0.5 ? 1 : 0);
  const shadow = `M ${top} A ${R} ${R} 0 0 ${waxing ? 0 : 1} ${bot} A ${rx} ${R} 0 0 ${term} ${top} Z`;
  const lit = `M ${top} A ${R} ${R} 0 0 ${waxing ? 1 : 0} ${bot} A ${rx} ${R} 0 0 ${term} ${top} Z`;
  return { f, rx, waxing, shadow, lit };
};

// Auswählbare Mond-Designs
const MOON_DESIGNS = [
  { id: "classic", label: "Klassisch" },
  { id: "gold",    label: "Gold" },
  { id: "neon",    label: "Neon" },
  { id: "cosmic",  label: "Kosmos" },
  { id: "minimal", label: "Minimal" },
];

const MOON_GLOW = {
  classic: "rgba(226,232,240,0.45)",
  gold:    "rgba(245,200,90,0.55)",
  neon:    "rgba(16,185,129,0.55)",
  cosmic:  "rgba(150,130,255,0.50)",
  minimal: "rgba(226,232,240,0.30)",
};

// Auswählbare UI-Farbschemata (alle dunkel, damit Glas-/Textfarben gültig bleiben)
// --bg ist mehrschichtig: oberer Akzent-Schimmer + Eck-Glanz + Basis-Verlauf
const UI_THEMES = [
  {
    id: "ditib",
    label: "DITIB",
    swatch: ["#14b8a6", "#5eead4", "#063b37"],
    vars: {
      "--bg":
        "radial-gradient(120% 85% at 50% -12%, rgba(45,212,191,0.20) 0%, transparent 46%), radial-gradient(95% 60% at 88% 112%, rgba(20,184,166,0.14) 0%, transparent 52%), linear-gradient(160deg, #0b524b 0%, #063b37 48%, #02201d 100%)",
      "--accent": "#2dd4bf",
      "--accent-strong": "#0d9488",
      "--accent-light": "#ccfbf1",
      "--accent-glow": "rgba(20,184,166,0.50)",
      "--accent2": "#5eead4",
      "--accent2-soft": "rgba(94,234,212,0.14)",
      "--next": "#fbbf24",
      "--next-border": "#fde68a",
      "--next-glow": "rgba(251,191,36,0.42)",
    },
  },
  {
    id: "turkish",
    label: "Türkei",
    swatch: ["#e30a17", "#fcd34d", "#240609"],
    vars: {
      "--bg":
        "radial-gradient(120% 85% at 50% -12%, rgba(227,10,23,0.24) 0%, transparent 46%), radial-gradient(95% 60% at 88% 112%, rgba(230,193,95,0.12) 0%, transparent 52%), linear-gradient(160deg, #3a0a0e 0%, #240609 50%, #120305 100%)",
      "--accent": "#f87171",
      "--accent-strong": "#e30a17",
      "--accent-light": "#fee2e2",
      "--accent-glow": "rgba(227,10,23,0.50)",
      "--accent2": "#fcd34d",
      "--accent2-soft": "rgba(252,211,77,0.14)",
      "--next": "#fbbf24",
      "--next-border": "#fde68a",
      "--next-glow": "rgba(251,191,36,0.42)",
    },
  },
  {
    id: "turquoise",
    label: "Türkis / Weiß",
    swatch: ["#0d9488", "#ffffff", "#b8ece4"],
    vars: {
      "--bg":
        "radial-gradient(120% 85% at 50% -12%, rgba(255,255,255,0.92) 0%, transparent 50%), radial-gradient(90% 70% at 85% 115%, rgba(45,212,191,0.30) 0%, transparent 55%), linear-gradient(160deg, #d8f6f1 0%, #b8ece4 50%, #9fe3d8 100%)",
      "--ink": "#0b3b38",
      "--ink-soft": "#5c8784",
      "--surface": "rgba(255,255,255,0.72)",
      "--surface-border": "rgba(13,148,136,0.18)",
      "--surface-2": "rgba(13,148,136,0.07)",
      "--accent": "#0d9488",
      "--accent-strong": "#14b8a6",
      "--accent-light": "#0f766e",
      "--accent-glow": "rgba(20,184,166,0.45)",
      "--accent2": "#0e7490",
      "--accent2-soft": "rgba(14,116,144,0.12)",
      "--next": "#f43f5e",
      "--next-border": "#fda4af",
      "--next-glow": "rgba(244,63,94,0.40)",
    },
  },
  {
    id: "midnight",
    label: "Mitternacht",
    swatch: ["#34d399", "#60a5fa", "#01040f"],
    vars: {
      "--bg":
        "radial-gradient(120% 80% at 50% -10%, rgba(52,211,153,0.12) 0%, transparent 45%), radial-gradient(100% 70% at 85% 110%, rgba(96,165,250,0.12) 0%, transparent 50%), linear-gradient(160deg, #070c1f 0%, #01040f 60%, #01030b 100%)",
      "--accent": "#34d399",
      "--accent-strong": "#10b981",
      "--accent-light": "#d1fae5",
      "--accent-glow": "rgba(16,185,129,0.45)",
      "--accent2": "#60a5fa",
      "--accent2-soft": "rgba(96,165,250,0.12)",
      "--next": "#f97316",
      "--next-border": "#fdba74",
      "--next-glow": "rgba(249,115,22,0.35)",
    },
  },
  {
    id: "gold",
    label: "Gold",
    swatch: ["#f3cf72", "#fcd34d", "#0c0a06"],
    vars: {
      "--bg":
        "radial-gradient(120% 80% at 50% -10%, rgba(245,200,90,0.16) 0%, transparent 45%), radial-gradient(90% 60% at 90% 110%, rgba(214,169,58,0.12) 0%, transparent 50%), linear-gradient(160deg, #1c1608 0%, #0c0a06 60%, #070501 100%)",
      "--accent": "#f3cf72",
      "--accent-strong": "#d6a93a",
      "--accent-light": "#fff4cf",
      "--accent-glow": "rgba(214,169,58,0.45)",
      "--accent2": "#fcd34d",
      "--accent2-soft": "rgba(252,211,77,0.12)",
      "--next": "#f8fafc",
      "--next-border": "#ffffff",
      "--next-glow": "rgba(248,250,252,0.52)",
      "--next-ink": "#1c1608",
    },
  },
  {
    id: "silver",
    label: "Silber",
    swatch: ["#f8fafc", "#cbd5e1", "#0b0f17"],
    vars: {
      "--bg":
        "radial-gradient(120% 80% at 50% -10%, rgba(248,250,252,0.20) 0%, transparent 45%), radial-gradient(90% 60% at 90% 110%, rgba(203,213,225,0.16) 0%, transparent 50%), linear-gradient(160deg, #171d26 0%, #0b0f17 60%, #05070b 100%)",
      "--accent": "#f8fafc",
      "--accent-strong": "#cbd5e1",
      "--accent-light": "#ffffff",
      "--accent-glow": "rgba(226,232,240,0.62)",
      "--accent2": "#e2e8f0",
      "--accent2-soft": "rgba(226,232,240,0.16)",
      "--next": "#f8fafc",
      "--next-border": "#ffffff",
      "--next-glow": "rgba(248,250,252,0.52)",
      "--next-ink": "#171d26",
    },
  },
  {
    id: "whiteGold",
    label: "Weiß / Gold",
    swatch: ["#ffffff", "#d6a93a", "#f7ead0"],
    vars: {
      "--bg":
        "radial-gradient(120% 85% at 50% -12%, rgba(255,255,255,0.96) 0%, transparent 50%), radial-gradient(95% 65% at 88% 112%, rgba(214,169,58,0.22) 0%, transparent 54%), linear-gradient(160deg, #ffffff 0%, #f8f1e2 52%, #ead9b8 100%)",
      "--ink": "#1f2937",
      "--ink-soft": "#6b5b35",
      "--surface": "rgba(255,255,255,0.72)",
      "--surface-border": "rgba(214,169,58,0.22)",
      "--surface-2": "rgba(214,169,58,0.10)",
      "--accent": "#d6a93a",
      "--accent-strong": "#b8860b",
      "--accent-light": "#7c5d13",
      "--accent-glow": "rgba(214,169,58,0.42)",
      "--accent2": "#f3cf72",
      "--accent2-soft": "rgba(214,169,58,0.16)",
      "--next": "#b8860b",
      "--next-border": "#d6a93a",
      "--next-glow": "rgba(214,169,58,0.40)",
    },
  },
  {
    id: "emerald",
    label: "Smaragd",
    swatch: ["#34d399", "#2dd4bf", "#04130d"],
    vars: {
      "--bg":
        "radial-gradient(120% 80% at 50% -10%, rgba(52,211,153,0.18) 0%, transparent 45%), radial-gradient(90% 60% at 12% 112%, rgba(45,212,191,0.12) 0%, transparent 52%), linear-gradient(160deg, #06281d 0%, #04130d 60%, #020b07 100%)",
      "--accent": "#34d399",
      "--accent-strong": "#059669",
      "--accent-light": "#d1fae5",
      "--accent-glow": "rgba(16,185,129,0.50)",
      "--accent2": "#2dd4bf",
      "--accent2-soft": "rgba(45,212,191,0.12)",
      "--next": "#fbbf24",
      "--next-border": "#fde68a",
      "--next-glow": "rgba(251,191,36,0.40)",
    },
  },
  {
    id: "indigo",
    label: "Indigo",
    swatch: ["#a78bfa", "#22d3ee", "#0a0a1f"],
    vars: {
      "--bg":
        "radial-gradient(120% 80% at 50% -10%, rgba(167,139,250,0.20) 0%, transparent 45%), radial-gradient(90% 60% at 85% 110%, rgba(34,211,238,0.12) 0%, transparent 50%), linear-gradient(160deg, #161636 0%, #0a0a1f 60%, #06061a 100%)",
      "--accent": "#a78bfa",
      "--accent-strong": "#7c3aed",
      "--accent-light": "#ede9fe",
      "--accent-glow": "rgba(124,58,237,0.50)",
      "--accent2": "#22d3ee",
      "--accent2-soft": "rgba(34,211,238,0.12)",
      "--next": "#f472b6",
      "--next-border": "#fbcfe8",
      "--next-glow": "rgba(244,114,182,0.40)",
    },
  },
  {
    id: "slate",
    label: "Schiefer",
    swatch: ["#e2e8f0", "#38bdf8", "#0b0f17"],
    vars: {
      "--bg":
        "radial-gradient(120% 80% at 50% -10%, rgba(56,189,248,0.12) 0%, transparent 45%), linear-gradient(160deg, #131923 0%, #0b0f17 60%, #080b12 100%)",
      "--accent": "#e2e8f0",
      "--accent-strong": "#cbd5e1",
      "--accent-light": "#f8fafc",
      "--accent-glow": "rgba(226,232,240,0.35)",
      "--accent2": "#38bdf8",
      "--accent2-soft": "rgba(56,189,248,0.12)",
      "--next": "#38bdf8",
      "--next-border": "#bae6fd",
      "--next-glow": "rgba(56,189,248,0.40)",
    },
  },
];

const DEFAULT_AUTO_THEME = {
  enabled: false,
  dayTheme: "whiteGold",
  nightTheme: "midnight",
};

const isThemeId = (id) => UI_THEMES.some((t) => t.id === id);

const GLASS = "bg-[var(--surface)] border-[color:var(--surface-border)] backdrop-blur-3xl shadow-2xl";

function WeatherIcon({ code, ...props }) {
  if (code === 0) return <Sun {...props} />;
  if (code <= 3) return <Cloud {...props} />;
  if (code <= 48) return <Cloud {...props} />;
  if (code <= 67) return <CloudRain {...props} />;
  if (code <= 77) return <CloudSnow {...props} />;
  if (code <= 82) return <CloudRain {...props} />;
  if (code <= 86) return <CloudSnow {...props} />;
  return <CloudLightning {...props} />;
}

function WeatherBadge({ weather, iconSize = "h-9 w-9", textSize = "text-4xl" }) {
  if (!weather) return null;
  return (
    <div className="flex items-center gap-2 text-[color:var(--ink-soft)]">
      <WeatherIcon code={weather.code} className={iconSize} />
      <span className={`${textSize} font-medium tabular-nums`}>{weather.temp}°C</span>
    </div>
  );
}

const LINKEDIN_QR_SRC =
  "https://api.qrserver.com/v1/create-qr-code/?size=96x96" +
  "&data=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fmetin-g%C3%BCrler-317704278%2F" +
  "&color=000000&bgcolor=FFFFFF&margin=2";

// Leise treibende Lichtpartikel für atmosphärischen Hintergrund
const AMBIENT_PARTICLES = [
  { x: 6, y: 14, size: 3, dur: 16, delay: 0 },
  { x: 18, y: 62, size: 2, dur: 13, delay: 1.2 },
  { x: 27, y: 30, size: 4, dur: 19, delay: 2.4 },
  { x: 38, y: 78, size: 2, dur: 14, delay: 0.6 },
  { x: 47, y: 12, size: 3, dur: 17, delay: 3.1 },
  { x: 58, y: 46, size: 2, dur: 12, delay: 1.8 },
  { x: 66, y: 84, size: 3, dur: 18, delay: 0.3 },
  { x: 74, y: 22, size: 2, dur: 15, delay: 2.7 },
  { x: 83, y: 58, size: 4, dur: 20, delay: 1.1 },
  { x: 91, y: 8, size: 2, dur: 13, delay: 3.6 },
  { x: 12, y: 90, size: 3, dur: 16, delay: 2.1 },
  { x: 95, y: 70, size: 2, dur: 14, delay: 0.9 },
];

function AmbientParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
      {AMBIENT_PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-[color:var(--accent-light,#ffffff)]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -18, 0],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function CreatorBadge() {
  return (
    <div className={`${GLASS} rounded-xl p-2 flex items-center gap-2 shrink-0`}>
      <img src={LINKEDIN_QR_SRC} alt="LinkedIn QR" width={42} height={42} className="block rounded-md shrink-0" />
      <div className="flex flex-col pr-1.5">
        <span className="text-[0.45rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent)] leading-none mb-0.5">Made by</span>
        <span className="text-[0.65rem] font-medium uppercase tracking-widest text-[color:var(--ink-soft)] leading-none">Metin Gürler</span>
        <span className="text-[0.6rem] text-[color:var(--accent)] leading-none mt-0.5">LinkedIn ↗</span>
      </div>
    </div>
  );
}

// Animated weather widget for Mihrab layout
function AnimatedWeatherWidget({ weather, iconBox = "w-[88px] h-[88px]", textSize = "text-5xl" }) {
  if (!weather) return null;
  const { temp, code } = weather;

  const isRainy    = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const isSnowy    = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const isThundery = code >= 95;
  const isClear    = code === 0;
  const isPartly   = code >= 1 && code <= 3;
  const isCloudy   = !isClear && !isPartly && !isRainy && !isSnowy && !isThundery;

  const drops = [
    { x: 30, delay: 0 }, { x: 44, delay: 0.22 }, { x: 58, delay: 0.44 },
    { x: 36, delay: 0.11 }, { x: 51, delay: 0.33 }, { x: 65, delay: 0.55 },
  ];

  const renderIcon = () => {
    if (isClear) return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id="wSunG" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
        </defs>
        <motion.circle cx="50" cy="50" r="26" fill="#f59e0b" opacity="0.15"
          animate={{ r: [26, 33, 26], opacity: [0.15, 0.05, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
        <circle cx="50" cy="50" r="18" fill="url(#wSunG)"
          style={{ filter: "drop-shadow(0 0 10px rgba(245,158,11,0.7))" }} />
        <motion.g animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "50px 50px" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <line key={i} x1="50" y1="27" x2="50" y2="19"
              stroke="#fde68a" strokeWidth="3" strokeLinecap="round"
              transform={`rotate(${i * 45} 50 50)`} opacity="0.9" />
          ))}
        </motion.g>
      </svg>
    );

    if (isPartly) return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <motion.circle cx="66" cy="36" r="14" fill="#fbbf24"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.65))" }} />
        <motion.g animate={{ x: [0, 4, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
          <circle cx="36" cy="56" r="14" fill="#94a3b8" />
          <circle cx="52" cy="50" r="18" fill="#94a3b8" />
          <circle cx="67" cy="56" r="12" fill="#94a3b8" />
          <rect x="22" y="54" width="57" height="20" rx="6" fill="#94a3b8" />
        </motion.g>
      </svg>
    );

    if (isCloudy) return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <motion.g animate={{ x: [0, 5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
          <circle cx="36" cy="46" r="16" fill="#94a3b8" />
          <circle cx="54" cy="40" r="20" fill="#94a3b8" />
          <circle cx="70" cy="46" r="14" fill="#94a3b8" />
          <rect x="20" y="44" width="64" height="24" rx="6" fill="#94a3b8" />
        </motion.g>
        {[66, 74, 82].map((y, i) => (
          <motion.line key={i} x1="28" y1={y} x2="72" y2={y}
            stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"
            animate={{ x1: [28, 22, 28], x2: [72, 78, 72], opacity: [0.45, 0.75, 0.45] }}
            transition={{ duration: 4, repeat: Infinity, delay: i * 0.6, ease: "easeInOut" }} />
        ))}
      </svg>
    );

    if (isRainy) return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <circle cx="34" cy="40" r="14" fill="#64748b" />
        <circle cx="51" cy="34" r="18" fill="#64748b" />
        <circle cx="67" cy="40" r="12" fill="#64748b" />
        <rect x="20" y="38" width="59" height="18" rx="5" fill="#64748b" />
        {drops.map(({ x, delay }, i) => (
          <motion.line key={i} x1={x} y1="60" x2={x - 5} y2="76"
            stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"
            animate={{ opacity: [0, 0.9, 0.9, 0], y: [0, 0, 16, 16] }}
            transition={{ duration: 0.85, repeat: Infinity, delay, ease: "easeIn" }} />
        ))}
      </svg>
    );

    if (isSnowy) return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <circle cx="34" cy="38" r="14" fill="#64748b" />
        <circle cx="51" cy="32" r="18" fill="#64748b" />
        <circle cx="67" cy="38" r="12" fill="#64748b" />
        <rect x="20" y="36" width="59" height="18" rx="5" fill="#64748b" />
        {drops.map(({ x, delay }, i) => (
          <motion.g key={i}
            animate={{ opacity: [0, 0.9, 0.9, 0], y: [0, 0, 22, 22] }}
            transition={{ duration: 1.8, repeat: Infinity, delay, ease: "easeIn" }}>
            <circle cx={x} cy="62" r="3" fill="#bfdbfe" />
            <line x1={x - 5} y1="62" x2={x + 5} y2="62" stroke="#bfdbfe" strokeWidth="1.5" />
            <line x1={x} y1="57" x2={x} y2="67" stroke="#bfdbfe" strokeWidth="1.5" />
          </motion.g>
        ))}
      </svg>
    );

    // Thunderstorm
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <circle cx="34" cy="34" r="15" fill="#475569" />
        <circle cx="52" cy="28" r="19" fill="#475569" />
        <circle cx="68" cy="34" r="13" fill="#475569" />
        <rect x="19" y="32" width="62" height="20" rx="5" fill="#475569" />
        {drops.slice(0, 4).map(({ x, delay }, i) => (
          <motion.line key={i} x1={x} y1="56" x2={x - 4} y2="69"
            stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"
            animate={{ opacity: [0, 0.7, 0.7, 0], y: [0, 0, 12, 12] }}
            transition={{ duration: 0.8, repeat: Infinity, delay, ease: "easeIn" }} />
        ))}
        <motion.path d="M56 55 L45 72 L54 72 L43 89 L67 67 L56 67 Z"
          fill="#fbbf24"
          animate={{ opacity: [1, 1, 0.1, 0.1, 1, 1, 0.1, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut",
            times: [0, 0.28, 0.33, 0.38, 0.43, 0.68, 0.73, 1] }}
          style={{ filter: "drop-shadow(0 0 9px rgba(251,191,36,0.85))" }} />
      </svg>
    );
  };

  return (
    <div className="flex items-center gap-4">
      <motion.div className={`${iconBox} shrink-0`}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
        {renderIcon()}
      </motion.div>
      <motion.span
        className={`${textSize} font-bold tabular-nums leading-none`}
        style={{
          background: "linear-gradient(135deg, var(--accent-light), var(--accent))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
        animate={{ filter: [
          "drop-shadow(0 0 6px var(--accent-glow))",
          "drop-shadow(0 0 18px var(--accent-glow))",
          "drop-shadow(0 0 6px var(--accent-glow))",
        ]}}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        {temp}°C
      </motion.span>
    </div>
  );
}

// Neutralfarben (Text/Flächen). Standard = dunkles Design; helle Themes überschreiben sie.
const NEUTRAL_DARK = {
  "--ink": "#ffffff",
  "--ink-soft": "#94a3b8",
  "--surface": "rgba(15,23,42,0.6)",
  "--surface-border": "rgba(255,255,255,0.10)",
  "--surface-2": "rgba(255,255,255,0.05)",
  "--next-ink": "#ffffff",
};

// Auswählbare Layouts (Gesamtstruktur der Oberfläche)
const LAYOUTS = [
  { id: "classic", label: "Klassisch" },
  { id: "focus",   label: "Fokus" },
  { id: "aurora",  label: "Aurora" },
  { id: "mihrab",  label: "Mihrab" },
  { id: "horizon", label: "Horizont" },
];

// Umriss einer Moschee-Nische (Mihrab-Bogen)
const ARCH_PATH = "M 8 128 L 8 52 Q 10 12 50 5 Q 90 12 92 52 L 92 128 Z";

// Religiöse Tage (Bayrame mit Gebetszeiten + Kandil-/Sondertage als Ankündigung).
// WICHTIG: Daten jährlich mit dem offiziellen DITIB/Diyanet-Kalender abgleichen!
// type "eid" zeigt Sabah-/Bayram-Gebetszeit, type "day" zeigt nur einen Countdown.
// window = ab wie vielen Tagen vorher angekündigt wird.
const DEFAULT_RELIGIOUS_DAYS = [
  { id: "regaib",   type: "day", date: "2026-01-15", title: "Regaib Kandili", window: 6 },
  { id: "mirac",    type: "day", date: "2026-02-15", title: "Miraç Kandili", window: 6 },
  { id: "berat",    type: "day", date: "2026-03-03", title: "Berat Kandili", window: 6 },
  { id: "ramazan",  type: "day", date: "2026-02-18", title: "Ramazan‑ı Şerif\nRamadan‑Beginn", window: 8 },
  { id: "kadir",    type: "day", date: "2026-03-16", title: "Kadir Gecesi\nLailat al‑Qadr", window: 6 },
  { id: "eid-fitr", type: "eid", date: "2026-03-20", title: "Ramazan Bayramı\nEid al‑Fitr", sabahTime: "05:35", prayerTime: "07:00", window: 8 },
  { id: "eid-adha", type: "eid", date: "2026-05-27", title: "Kurban Bayramı\nEid al‑Adha", sabahTime: "04:30", prayerTime: "06:30", window: 8 },
  { id: "hicri",    type: "day", date: "2026-06-26", title: "Hicri Yılbaşı\nIslam. Neujahr 1448", window: 6 },
  { id: "asure",    type: "day", date: "2026-07-05", title: "Aşure Günü", window: 6 },
  { id: "mevlid",   type: "day", date: "2026-08-25", title: "Mevlid Kandili", window: 6 },
];

// Gemeinsame Darstellung eines religiösen Tages (Bayram mit Zeiten oder Ankündigung)
function SpecialDayPanel({ specialDay, config, variant = "panel" }) {
  const { type, title, daysLeft, isToday, sabahDateTime, prayerDateTime, date } = specialDay;
  const countdown = isToday ? "Heute" : `Noch ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}`;
  const dateText = date ? dayjs(date).format("DD.MM.YYYY") : "";

  if (variant === "band") {
    return (
      <>
        <span className="text-3xl font-medium text-[color:var(--accent)] uppercase tracking-[0.15em]" style={{ hyphens: "none" }}>{title.replace(/\n/g, " · ")}</span>
        {type === "eid" ? (
          <>
            <span className="text-3xl">Sabah <b className="tabular-nums">{fmt(sabahDateTime, config.tz)}</b></span>
            <span className="text-3xl text-[color:var(--accent)]">Bayram <b className="tabular-nums">{fmt(prayerDateTime, config.tz)}</b></span>
          </>
        ) : (
          <span className="text-3xl text-[color:var(--accent)]">{countdown}</span>
        )}
        <span className="text-3xl text-[color:var(--ink-soft)] tabular-nums">{dateText}</span>
      </>
    );
  }

  const lg = variant === "panelLg";
  return (
    <>
      <p className={`whitespace-pre-line font-medium text-[color:var(--accent)] uppercase ${lg ? "text-4xl mb-7 tracking-[0.18em]" : "text-3xl mb-5 tracking-[0.15em]"}`} style={{ hyphens: "none" }}>{title}</p>
      <h4 className={`font-medium leading-tight text-[color:var(--ink)] ${lg ? "text-4xl mb-7" : "text-3xl mb-5"}`}>
        {type === "eid" ? (isToday ? "Heute ist Bayram" : `${countdown} bis Bayram / Eid`) : countdown}
      </h4>
      {type === "eid" && (
        <>
          <p className={`font-medium text-[color:var(--ink-soft)] uppercase tracking-[0.2em] ${lg ? "text-2xl mb-4" : "text-xl mb-3"}`}>Namazlar</p>
          <div className="w-full grid grid-cols-2 gap-6">
            <div className={`bg-[var(--surface-2)] rounded-[32px] border border-[color:var(--surface-border)] flex flex-col items-center ${lg ? "p-10" : "p-6"}`}>
              <p className={`font-semibold text-[color:var(--ink-soft)] uppercase tracking-widest ${lg ? "text-3xl mb-3" : "text-2xl mb-2"}`}>Sabah</p>
              <p className={`font-medium leading-none tabular-nums text-[color:var(--ink)] ${lg ? "text-7xl" : "text-6xl"}`}>{fmt(sabahDateTime, config.tz)}</p>
            </div>
            <div className={`bg-[var(--accent2-soft)] rounded-[32px] border border-[color:var(--accent2-soft)] flex flex-col items-center ${lg ? "p-10" : "p-6"}`}>
              <p className={`font-semibold text-[color:var(--accent2)] uppercase tracking-widest ${lg ? "text-3xl mb-3" : "text-2xl mb-2"}`}>Bayram</p>
              <p className={`font-medium leading-none tabular-nums text-[color:var(--accent-light)] ${lg ? "text-7xl" : "text-6xl"}`}>{fmt(prayerDateTime, config.tz)}</p>
            </div>
          </div>
        </>
      )}
      <p className={`text-[color:var(--ink-soft)] ${lg ? "mt-6 text-3xl" : "mt-4 text-2xl"}`}>{dateText}</p>
    </>
  );
}

// Animierte Mond-Darstellung, die die echte aktuelle Phase im gewählten Design zeigt
function MoonPhase({ size = 140, date = new Date(), variant = "classic" }) {
  const phase = useMemo(() => getMoonPhase(date), [date]);
  const uid = useId().replace(/:/g, "");
  const cx = 50, cy = 50;
  const R = variant === "cosmic" ? 32 : variant === "gold" ? 46 : 48;
  const geo = moonGeometry(phase, R, cx, cy);

  const renderMoon = () => {
    switch (variant) {
      case "gold":
        return (
          <>
            <defs>
              <radialGradient id={`${uid}-lit`} cx="36%" cy="30%" r="85%">
                <stop offset="0%" stopColor="#fff7da" />
                <stop offset="50%" stopColor="#f2cf72" />
                <stop offset="100%" stopColor="#b9821e" />
              </radialGradient>
              <clipPath id={`${uid}-clip`}><circle cx={cx} cy={cy} r={R} /></clipPath>
              <filter id={`${uid}-blur`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1" /></filter>
            </defs>
            <circle cx={cx} cy={cy} r={R + 2.5} fill="none" stroke="#f5d77e" strokeWidth="0.5" opacity="0.5" />
            <g clipPath={`url(#${uid}-clip)`}>
              <circle cx={cx} cy={cy} r={R} fill={`url(#${uid}-lit)`} />
              <g fill="#c79428" opacity="0.45">
                <circle cx="40" cy="36" r="5" />
                <circle cx="60" cy="46" r="4" />
                <circle cx="47" cy="60" r="5.5" />
                <circle cx="64" cy="64" r="3" />
                <circle cx="34" cy="52" r="2.6" />
              </g>
              <path d={geo.shadow} fill="#160f04" opacity="0.94" filter={`url(#${uid}-blur)`} />
            </g>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,230,160,0.35)" strokeWidth="0.7" />
          </>
        );
      case "neon":
        return (
          <>
            <defs>
              <linearGradient id={`${uid}-lit`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5eead4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx={cx} cy={cy} r={R} fill="rgba(255,255,255,0.04)" stroke="rgba(94,234,212,0.25)" strokeWidth="0.8" />
            <path d={geo.lit} fill={`url(#${uid}-lit)`} opacity="0.9" filter={`url(#${uid}-glow)`} />
            <path d={geo.lit} fill="none" stroke="#ccfbf1" strokeWidth="0.8" opacity="0.8" />
          </>
        );
      case "cosmic":
        return (
          <>
            <defs>
              <radialGradient id={`${uid}-neb`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(150,130,255,0)" />
                <stop offset="70%" stopColor="rgba(120,100,230,0.12)" />
                <stop offset="100%" stopColor="rgba(80,60,160,0)" />
              </radialGradient>
              <radialGradient id={`${uid}-lit`} cx="40%" cy="34%" r="80%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="70%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#94a3b8" />
              </radialGradient>
              <clipPath id={`${uid}-clip`}><circle cx={cx} cy={cy} r={R} /></clipPath>
              <filter id={`${uid}-blur`}><feGaussianBlur stdDeviation="0.8" /></filter>
            </defs>
            <circle cx={cx} cy={cy} r="48" fill={`url(#${uid}-neb)`} />
            {[[18, 20, 1.1, 0], [82, 26, 0.9, 0.6], [24, 78, 1.0, 1.2], [80, 74, 1.2, 0.3], [50, 11, 0.8, 0.9], [13, 50, 0.7, 1.5], [88, 52, 0.9, 0.4]].map(([x, y, r, d], i) => (
              <motion.circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill="#ffffff"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: d, ease: "easeInOut" }}
              />
            ))}
            <g clipPath={`url(#${uid}-clip)`}>
              <circle cx={cx} cy={cy} r={R} fill={`url(#${uid}-lit)`} />
              <g fill="#94a3b8" opacity="0.5">
                <circle cx="44" cy="44" r="3.5" />
                <circle cx="58" cy="52" r="2.6" />
                <circle cx="48" cy="58" r="4" />
                <circle cx="40" cy="52" r="1.8" />
              </g>
              <path d={geo.shadow} fill="#0a0a18" opacity="0.96" filter={`url(#${uid}-blur)`} />
            </g>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(203,213,225,0.2)" strokeWidth="0.6" />
          </>
        );
      case "minimal":
        return (
          <>
            <defs>
              <linearGradient id={`${uid}-lit`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
            </defs>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            <path d={geo.lit} fill={`url(#${uid}-lit)`} opacity="0.95" />
          </>
        );
      default: // classic
        return (
          <>
            <defs>
              <radialGradient id={`${uid}-lit`} cx="38%" cy="32%" r="80%">
                <stop offset="0%" stopColor="#fdfcf3" />
                <stop offset="65%" stopColor="#e7e4d5" />
                <stop offset="100%" stopColor="#b6b3a4" />
              </radialGradient>
              <clipPath id={`${uid}-clip`}><circle cx={cx} cy={cy} r={R} /></clipPath>
              <filter id={`${uid}-blur`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.9" /></filter>
            </defs>
            <g clipPath={`url(#${uid}-clip)`}>
              <circle cx={cx} cy={cy} r={R} fill={`url(#${uid}-lit)`} />
              <g fill="#a6a392" opacity="0.55">
                <circle cx="38" cy="34" r="6" />
                <circle cx="60" cy="44" r="4.6" />
                <circle cx="46" cy="61" r="7" />
                <circle cx="65" cy="66" r="3.4" />
                <circle cx="32" cy="52" r="3" />
                <circle cx="55" cy="27" r="2.4" />
                <circle cx="70" cy="54" r="2.2" />
              </g>
              <g fill="#cfccbb" opacity="0.45">
                <circle cx="40" cy="36" r="2.6" />
                <circle cx="48" cy="63" r="3.2" />
                <circle cx="62" cy="46" r="2" />
              </g>
              <path d={geo.shadow} fill="#070b18" opacity="0.97" filter={`url(#${uid}-blur)`} />
            </g>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.7" />
          </>
        );
    }
  };

  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      style={{ width: size, height: size }}
      className="relative shrink-0"
    >
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${MOON_GLOW[variant] || MOON_GLOW.classic} 0%, transparent 70%)` }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.92, 1.06, 0.92] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 100 100" width={size} height={size} className="relative">
        {renderMoon()}
      </svg>
    </motion.div>
  );
}

// Analoge Uhr, deren Zeiger permanent auf die Fajr-Fard-Zeit (Sonnenaufgang - 45 Min) zeigen
function FajrAnalogClock({ size = 110, time }) {
  const t = dayjs(time);
  const hours = t.hour() % 12;
  const minutes = t.minute();
  const cx = 50, cy = 50;
  const toXY = (angleDeg, len) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + len * Math.cos(rad), y: cy + len * Math.sin(rad) };
  };
  const hourPt = toXY(hours * 30 + minutes * 0.5, 24);
  const minutePt = toXY(minutes * 6, 34);
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    const major = i % 3 === 0;
    const outer = toXY(angle, 44);
    const inner = toXY(angle, major ? 36 : 39);
    return { ...outer, x2: inner.x, y2: inner.y, major };
  });

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0">
      <circle cx={cx} cy={cy} r="46" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      {ticks.map((tk, i) => (
        <line
          key={i}
          x1={tk.x2} y1={tk.y2} x2={tk.x} y2={tk.y}
          stroke={tk.major ? "var(--accent)" : "var(--ink-soft)"}
          strokeWidth={tk.major ? 2 : 1}
          strokeLinecap="round"
        />
      ))}
      <line x1={cx} y1={cy} x2={hourPt.x} y2={hourPt.y} stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={minutePt.x} y2={minutePt.y} stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="2.6" fill="var(--accent)" />
    </svg>
  );
}

export default function PrayerTVBeautiful() {
  const [config, setConfig] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_tv_config") : null;
    return saved ? JSON.parse(saved) : {
      name: "DITIB Yavuz Sultan Selim Moschee",
      latitude: 48.6215,
      longitude: 9.8294,
      tz: DEFAULT_TZ,
      offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
      iqama: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },

      eidAlFitr: {
        date: "2026-03-20",
        sabahTime: "05:35",
        prayerTime: "07:00",     // Eid-Gebet
        title: "Ramazan Bayramı\nEId al-FItr"
      },
    };
  });

  const [calendar, setCalendar] = useState(null);
  const [now, setNow] = useState(dayjs().tz(config.tz));
  const [randomAyah, setRandomAyah] = useState({ text: "Lade kurzen Vers...", ref: "" });
  const [moonDesign, setMoonDesign] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_moon_design") : null;
    return saved && MOON_DESIGNS.some((d) => d.id === saved) ? saved : "classic";
  });
  const [uiTheme, setUiTheme] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_ui_theme") : null;
    return saved && UI_THEMES.some((t) => t.id === saved) ? saved : "midnight";
  });
  const [autoTheme, setAutoTheme] = useState(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_auto_theme") : null;
      const parsed = saved ? JSON.parse(saved) : null;
      return {
        enabled: Boolean(parsed?.enabled ?? DEFAULT_AUTO_THEME.enabled),
        dayTheme: isThemeId(parsed?.dayTheme) ? parsed.dayTheme : DEFAULT_AUTO_THEME.dayTheme,
        nightTheme: isThemeId(parsed?.nightTheme) ? parsed.nightTheme : DEFAULT_AUTO_THEME.nightTheme,
      };
    } catch {
      return DEFAULT_AUTO_THEME;
    }
  });
  const [layout, setLayout] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_layout") : null;
    return saved && LAYOUTS.some((l) => l.id === saved) ? saved : "classic";
  });
  const [mihrabBg, setMihrabBg] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_mihrab_bg") : null;
    return saved === "ottoman" ? "ottoman" : "selcuklu";
  });
  const [showCreatorBadge, setShowCreatorBadge] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_creator_badge") : null;
    return saved === null ? true : saved === "true";
  });
  const [religiousDays, setReligiousDays] = useState(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_religious_days") : null;
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* ungültige Daten ignorieren */ }
    return DEFAULT_RELIGIOUS_DAYS;
  });
  const [testDayId, setTestDayId] = useState(() => {
    return (typeof window !== "undefined" ? localStorage.getItem("prayer_test_day") : null) || null;
  });
  const lastFetchRef = useRef(0);
  const [weather, setWeather] = useState(null);

  const updateDay = (id, patch) =>
    setReligiousDays((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_moon_design", moonDesign);
  }, [moonDesign]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_ui_theme", uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_auto_theme", JSON.stringify(autoTheme));
  }, [autoTheme]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_layout", layout);
  }, [layout]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_mihrab_bg", mihrabBg);
  }, [mihrabBg]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_creator_badge", String(showCreatorBadge));
  }, [showCreatorBadge]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_religious_days", JSON.stringify(religiousDays));
  }, [religiousDays]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (testDayId) localStorage.setItem("prayer_test_day", testDayId);
    else localStorage.removeItem("prayer_test_day");
  }, [testDayId]);

  const today = useMemo(() => now.startOf("day"), [now]);

  const hijriText = useMemo(() => {
    const key = today.format("YYYY-MM-DD");
    return calendar?.[key]?.hijri || "--";
  }, [calendar, today]);

  const specialDay = useMemo(() => {
    const inactive = {
      active: false, type: null, title: "", date: null,
      daysLeft: null, isToday: false, sabahDateTime: null, prayerDateTime: null,
    };

    const build = (ev, diff, baseDay) => ({
      active: true,
      type: ev.type,
      title: ev.title,
      date: ev.date,
      daysLeft: diff,
      isToday: diff === 0,
      sabahDateTime: ev.sabahTime ? toDateWithTime(baseDay, ev.sabahTime).toDate() : null,
      prayerDateTime: ev.prayerTime ? toDateWithTime(baseDay, ev.prayerTime).toDate() : null,
    });

    // Test-Modus: gewählten Tag sofort als "heute" aktiv anzeigen
    if (testDayId) {
      const ev = religiousDays.find((d) => d.id === testDayId);
      if (ev) return build(ev, 0, today);
    }

    let best = null;
    for (const ev of religiousDays) {
      if (!ev.date) continue;
      const day = dayjs.tz(ev.date, config.tz).startOf("day");
      const diff = day.diff(today, "day");
      const win = ev.window ?? 8;
      if (diff < 0 || diff > win) continue;          // außerhalb des Ankündigungsfensters
      if (best && diff >= best.daysLeft) continue;   // einen näheren Tag bevorzugen
      best = build(ev, diff, day);
    }
    return best || inactive;
  }, [religiousDays, testDayId, config.tz, today]);

  // Dynamische Berechnung der Schriftgröße basierend auf der Zeichenanzahl
  const dynamicFontSize = useMemo(() => {
    const len = randomAyah.text.length;
    if (len < 50) return "2.6rem";   // Sehr kurz
    if (len < 100) return "2.1rem";  // Kurz
    if (len < 150) return "1.8rem";  // Mittel
    if (len < 200) return "1.6rem";  // Lang
    if (len < 250) return "1.45rem";
    if (len < 300) return "1.3rem";
    if (len < 350) return "1.15rem";
    if (len < 400) return "1.05rem";
    if (len < 550) return "0.95rem";
    if (len < 700) return "0.85rem";
    if (len < 900) return "0.75rem";
    return "0.68rem";                // Sehr lang (Hadithe bis ~900 Zeichen)
  }, [randomAyah.text]);

  const fetchRandomAyah = async (force = false) => {
    const currentTime = Date.now();
    if (!force && currentTime - lastFetchRef.current < 600000) return;

    const useHadith = Math.random() < 0.4;

    try {
      if (useHadith) {
        const id = CURATED_HADITHS[Math.floor(Math.random() * CURATED_HADITHS.length)];
        const res = await fetch(`https://hadeethenc.com/api/v1/hadeeths/one/?language=de&id=${id}`);
        const data = await res.json();
        if (data.title) {
          const text = data.title.replace(/^[„"‚'‘]+/, "").replace(/[""''"“”]+$/, "").trim();
          const attribution = /[؀-ۿ]/.test(data.attribution || "") ? "Hadith" : data.attribution;
          setRandomAyah({ text, ref: attribution || "Hadith" });
          lastFetchRef.current = currentTime;
          return;
        }
      }

      const ref = CURATED_AYAHS[Math.floor(Math.random() * CURATED_AYAHS.length)];
      const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ref}/de.bubenheim`);
      const data = await res.json();
      if (data.status === "OK") {
        setRandomAyah({
          text: data.data.text,
          ref: `${data.data.surah.englishName} (${data.data.surah.number}:${data.data.numberInSurah})`
        });
        lastFetchRef.current = currentTime;
      }
    } catch (e) {
      setRandomAyah({ text: "Gedenkt Meiner, so gedenke Ich eurer.", ref: "(2:152)" });
      lastFetchRef.current = currentTime;
    }
  };

  useEffect(() => {
    fetch("/diyanet-geislingen-2026.json").then(res => res.json()).then(setCalendar).catch(console.error);
    fetchRandomAyah(true);
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${config.latitude}&longitude=${config.longitude}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(config.tz)}`
        );
        const data = await res.json();
        if (data.current) {
          setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code });
        }
      } catch { /* silently fail */ }
    };
    fetchWeather();
    const id = setInterval(fetchWeather, 600000);
    return () => clearInterval(id);
  }, [config.latitude, config.longitude, config.tz]);

  const times = useMemo(() => {
    const key = today.format("YYYY-MM-DD");
    const calRow = calendar?.[key];
    let base = {};
    if (calRow) {
      PRAYER_ORDER.forEach(k => base[k] = toDateWithTime(today, calRow[k]).toDate());
    } else {
      const coords = new adhan.Coordinates(config.latitude, config.longitude);
      const pt = new adhan.PrayerTimes(coords, today.toDate(), adhan.CalculationMethod.Turkey());
      PRAYER_ORDER.forEach(k => base[k] = pt[k]);
    }
    const shifted = { ...base };
    PRAYER_ORDER.forEach(k => shifted[k] = dayjs(base[k]).add(config.offsets[k] || 0, "minute").toDate());
    return shifted;
  }, [today, calendar, config]);

  const effectiveThemeState = useMemo(() => {
    if (!autoTheme.enabled) return { id: uiTheme, phase: "manual" };

    const sunrise = dayjs(times.sunrise);
    const nightStart = dayjs(times.maghrib).subtract(30, "minute");
    const isNight = now.isBefore(sunrise) || !now.isBefore(nightStart);
    const id = isNight ? autoTheme.nightTheme : autoTheme.dayTheme;

    return {
      id: isThemeId(id) ? id : uiTheme,
      phase: isNight ? "night" : "day",
    };
  }, [autoTheme, uiTheme, times.sunrise, times.maghrib, now]);

  const theme = useMemo(
    () => UI_THEMES.find((t) => t.id === effectiveThemeState.id) || UI_THEMES[0],
    [effectiveThemeState.id]
  );

  useEffect(() => {
    const id = setInterval(() => setNow(dayjs().tz(config.tz)), 1000);
    return () => clearInterval(id);
  }, [config.tz]);

  const upcoming = useMemo(() => {
    // 1. Versuche die Gebete für HEUTE zu finden
    const arrToday = PRAYER_ORDER.map(k => ({ key: k, t: dayjs(times[k]) }));
    let found = arrToday.find(e => e.t.isAfter(now));

    // 2. Wenn heute nichts mehr kommt (nach Isha), nimm das erste Gebet von MORGEN
    if (!found) {
      const tomorrow = today.add(1, "day");
      const key = tomorrow.format("YYYY-MM-DD");
      const calRow = calendar?.[key];
      
      let nextFajr;
      if (calRow) {
        // Zeit aus dem DITIB Kalender für morgen
        nextFajr = toDateWithTime(tomorrow, calRow.fajr).add(config.offsets.fajr || 0, "minute");
      } else {
        // Adhan-Berechnung für morgen
        const coords = new adhan.Coordinates(config.latitude, config.longitude);
        const ptTomorrow = new adhan.PrayerTimes(coords, tomorrow.toDate(), adhan.CalculationMethod.Turkey());
        nextFajr = dayjs(ptTomorrow.fajr).add(config.offsets.fajr || 0, "minute");
      }
      
      found = { key: "fajr", t: nextFajr, isTomorrow: true };
    }

  // Ayah Refresh Trigger
  if (found.key && config.iqama[found.key] === 0) fetchRandomAyah();
  
  return found;
}, [times, now, config, calendar, today]);

  const currentPrayerKey = useMemo(() => {
    return [...PRAYER_ORDER].reverse().find(k => dayjs(times[k]).isSameOrBefore(now));
  }, [times, now]);

  const remaining = useMemo(() => {
    if (!upcoming.t) return null;
    const dur = dayjs.duration(upcoming.t.diff(now));
    return `${Math.floor(dur.asHours())}:${String(dur.minutes()).padStart(2, "0")}:${String(dur.seconds()).padStart(2, "0")}`;
  }, [upcoming, now]);

  const progressPct = useMemo(() => {
    const idx = PRAYER_ORDER.indexOf(upcoming.key);
    const start = idx > 0 ? dayjs(times[PRAYER_ORDER[idx - 1]]) : now.startOf("day");
    const end = upcoming.t || now.endOf("day");
    return Math.min(100, Math.max(0, (now.diff(start) / end.diff(start)) * 100));
  }, [upcoming, times, now]);

  const glass = GLASS;
  const fajrClockTime = dayjs(times.sunrise).subtract(45, "minute");

  const view = {
    config, now, hijriText, specialDay, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign, weather, mihrabBg,
  };

  const renderThemePicker = (selectedId, onSelect) => (
    <div className="grid grid-cols-2 gap-3 mt-3">
      {UI_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
            selectedId === t.id
              ? "border-emerald-400 bg-emerald-500/10"
              : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          <span className="flex shrink-0 -space-x-1.5">
            {t.swatch.map((c, i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-full border border-black/40"
                style={{ background: c }}
              />
            ))}
          </span>
          <span className="text-sm text-slate-200">{t.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div
      lang="tr"
      style={{ ...NEUTRAL_DARK, ...theme.vars, background: theme.vars["--bg"] }}
      className="relative h-screen w-full text-[color:var(--ink)] font-sans overflow-hidden transition-colors duration-700"
    >
      {layout === "focus" ? (
        <FocusLayout view={view} />
      ) : layout === "aurora" ? (
        <AuroraLayout view={view} />
      ) : layout === "mihrab" ? (
        <MihrabLayout view={view} />
      ) : layout === "horizon" ? (
        <HorizonLayout view={view} />
      ) : (
      <div className="relative h-full w-full p-8 flex flex-col justify-between">
      <AmbientParticles />
      {/* HEADER */}
      <header className="flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-2 max-w-[75%]">
          <div className="flex items-center gap-6">
            <motion.img
              src="\DITIB-Logo.svg.png"
              alt="Moschee Logo"
              className="h-16 w-auto object-contain"
              initial={{ opacity: 0, y: -24, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />

            <motion.h1
              className="text-7xl font-medium tracking-tight uppercase leading-none truncate drop-shadow-lg"
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
            >
              {config.name}
            </motion.h1>
          </div>
          <div className="flex gap-6 items-center">
            <motion.span
              className="text-5xl text-[color:var(--accent)] font-bold mt-6"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.25 }}
            >
              {now.format("dddd, DD. MMMM")}
            </motion.span>
            {weather && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.4 }}
              >
                <AnimatedWeatherWidget weather={weather} iconBox="w-16 h-16" textSize="text-4xl" />
              </motion.div>
            )}
          </div>
        </div>

        <motion.div
          className="flex flex-col items-end"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
        >
          <div className="text-[10rem] font-medium tabular-nums leading-none flex items-baseline drop-shadow-2xl">
            {now.format("HH:mm")}
            <span className="text-6xl text-[color:var(--accent)] font-medium ml-6 tracking-[0.1em] opacity-90">{now.format("ss")}</span>
          </div>
        </motion.div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="grid grid-cols-12 gap-8 flex-[7] min-h-0 my-4">
        <Card className={`col-span-8 rounded-[55px] ${glass} border-t-[color:var(--accent)] border-t-8 flex flex-col`}>
          <CardContent className="relative p-12 h-full flex flex-col justify-between overflow-hidden">
            <div>
              <p className="text-[color:var(--accent)] text-2xl font-medium tracking-[0.3em] uppercase mb-6 flex items-center gap-4">
                <span className="w-14 h-1.5 bg-[var(--accent)]" /> Nächstes Gebet
              </p>
              <h2 className="text-[7.5rem] font-medium leading-none tracking-tighter whitespace-nowrap">
                {upcoming.key ? (
                  <>{LABELS[upcoming.key].tr} <span className="text-[color:var(--ink-soft)] font-thin text-[inherit] mx-4">/</span> <span className="text-[color:var(--accent-light)] text-[inherit]">{LABELS[upcoming.key].ar}</span></>
                ) : "—"}
              </h2>
              <p className="max-w-[52%] text-5xl font-bold text-[color:var(--ink-soft)] mt-3 tracking-tight italic">
                Beginn um {fmt(upcoming.t, config.tz)} Uhr {upcoming.isTomorrow ? "(Morgen)" : ""}
              </p>
            </div>

            <div className="absolute top-6 right-10 z-10 w-[42%] max-w-[340px] flex flex-col items-center justify-center gap-3 bg-[var(--surface-2)] px-6 py-4 rounded-[40px] border border-[color:var(--surface-border)] shadow-inner">
              <FajrAnalogClock size={140} time={fajrClockTime} />
              <div className="flex flex-col items-center text-center text-[color:var(--accent)] min-w-0">
                <span className="text-2xl font-semibold uppercase tracking-[0.08em] text-[color:var(--ink)] mb-1">Sabah / Fajr Farz</span>
                <span className="text-5xl font-medium leading-tight tabular-nums">{fmt(fajrClockTime, config.tz)}</span>
              </div>
            </div>

            <div className="flex justify-between items-end gap-8">
              <div className="w-[52%]">
                <p lang="de" className="text-[color:var(--ink-soft)] text-2xl font-medium mt-4 mb-3 uppercase tracking-widest">Verbleibend</p>
                <p className="text-[8rem] font-medium tabular-nums tracking-tighter leading-none">{remaining}</p>
                <div className="h-7 w-full bg-[var(--surface-2)] rounded-full mt-8 overflow-hidden border border-[color:var(--surface-border)] p-1 shadow-inner">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    className="relative h-full overflow-hidden bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent)] rounded-full shadow-[0_0_40px_var(--accent-glow)]"
                  >
                    <motion.div
                      className="absolute inset-y-0 w-1/3"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }}
                      animate={{ x: ["-120%", "220%"] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </motion.div>
                </div>
              </div>

              <div className="w-[42%] flex items-center justify-center gap-5 bg-[var(--surface-2)] px-8 py-5 rounded-[35px] border border-[color:var(--surface-border)] shadow-xl">
                <motion.div
                  className="shrink-0"
                  animate={{
                    y: [0, -6, 0],
                    filter: [
                      "drop-shadow(0 0 8px var(--accent-glow))",
                      "drop-shadow(0 0 20px var(--accent-glow))",
                      "drop-shadow(0 0 8px var(--accent-glow))",
                    ],
                  }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <MoonPhase size={110} date={now.toDate()} variant={moonDesign} />
                </motion.div>
                <div className="flex flex-col text-[color:var(--accent)] min-w-0">
                  <span className="text-lg uppercase tracking-[0.2em] text-[color:var(--ink-soft)] mb-1">
                    {getMoonPhaseName(getMoonPhase(now.toDate()))}
                  </span>
                  <span className="text-3xl font-medium leading-tight">
                    {hijriText}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RECHTS: AKTUELL / ZITAT */}
        <Card className={`col-span-4 rounded-[55px] ${glass} p-12 flex flex-col justify-between border-t-[color:var(--accent)] border-t-8 overflow-hidden h-full`}>
          {!specialDay.active && (
            <div className="shrink-0">
              <p className="text-[color:var(--accent)] text-2xl font-medium tracking-[0.3em] uppercase mb-2">Aktuell</p>
              <h3 className="text-4xl font-medium leading-tight italic truncate">
                {currentPrayerKey ? (
                  <>{upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr} <span className="text-[color:var(--ink-soft)] text-2xl">/ {LABELS[currentPrayerKey].ar}</span></>
                ) : "—"}
              </h3>
              <p className="text-2xl font-bold text-[color:var(--ink-soft)] mt-1 tabular-nums">
                Seit {fmt(times[currentPrayerKey], config.tz)}
              </p>
            </div>
          )}

            <div className="bg-[var(--surface-2)] rounded-[45px] p-6 text-center border border-[color:var(--surface-border)] shadow-inner flex flex-col justify-center items-center overflow-hidden flex-1 min-h-0">            <AnimatePresence mode="wait">
              {specialDay.active ? (
                <motion.div
                  key="special"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="w-full h-full flex flex-col items-center justify-center text-center px-4"
                >
                  <SpecialDayPanel specialDay={specialDay} config={config} variant="panelLg" />
                </motion.div>
              ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div
                  key="ayah"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="w-full flex flex-col items-center justify-center"
                  style={{ hyphens: "auto", wordBreak: "break-word" }}
                >
                  <Quote className="h-10 w-10 text-[color:var(--accent)] mb-4 opacity-30 shrink-0" />
                  <p
                    lang="de"
                    className="font-medium text-[color:var(--ink)] italic leading-[1.2] px-4 text-center antialiased"
                    style={{
                      fontSize: dynamicFontSize,
                      transition: "font-size 0.3s ease"
                    }}
                  >
                    "{randomAyah.text}"
                  </p>
                  <p className="mt-4 text-lg text-[color:var(--accent)] font-medium uppercase tracking-widest shrink-0 opacity-70">
                    {randomAyah.ref}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="iqama"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="flex flex-col items-center"
                >
                  <Clock className="h-12 w-12 text-[color:var(--accent)] mb-4 opacity-70" />
                  <p className="text-2xl font-medium text-[color:var(--ink-soft)] uppercase tracking-widest mb-2">
                    Gamet / Iqama
                  </p>
                  <p className="text-[7.5rem] font-medium tabular-nums leading-none">
                    {upcoming.key === "sunrise"
                      ? fmt(dayjs(times.sunrise).subtract(45, "minute"), config.tz)
                      : fmt(dayjs(times[upcoming.key]).add(config.iqama[upcoming.key], "minute"), config.tz)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </main>

      {/* FOOTER: PRAYER BOXES */}
      <footer className="grid grid-cols-6 gap-6 flex-[3] min-h-0 mb-2">
        {PRAYER_ORDER.map((k) => {
          const active = currentPrayerKey === k;

          const isNext =
            upcoming.key === k &&
            (!upcoming.isTomorrow || now.hour() === 0);
          const useDarkerTimelineText = theme.id === "turquoise" && !active && !isNext;

          // Logik für die dynamischen Klassen
          let statusClasses = `bg-[var(--surface-2)] border-transparent opacity-90 ${useDarkerTimelineText ? "text-[#021b19]" : "text-[color:var(--ink)]"}`; // Standard (Vergangen/Zukünftig)

          if (active) {
            statusClasses = "bg-[var(--accent-strong)] border-[color:var(--accent-light)] shadow-[0_0_80px_var(--accent-glow)] scale-110 z-20 text-black";
          } else if (isNext) {
            // Hervorhebung für das nächste Gebet
            statusClasses = "bg-[var(--next)] border-[color:var(--next-border)] shadow-[0_0_60px_var(--next-glow)] z-10 text-[color:var(--next-ink)] animate-pulse-subtle";
          }

          return (
            <motion.div 
              key={k} 
              className={`rounded-[45px] p-8 border-4 transition-all duration-700 flex flex-col justify-center items-center text-center ${statusClasses}`}
            >
              <div className="flex flex-col mb-4">
                <span lang="tr" className="text-4xl font-medium uppercase tracking-tighter leading-none">
                  {LABELS[k].tr}
                </span>
                <span className={`text-2xl font-bold opacity-70 uppercase leading-none mt-2 ${active ? "text-black" : isNext ? "text-[color:var(--next-ink)]" : useDarkerTimelineText ? "text-[#021b19]" : "text-[color:var(--ink-soft)]"}`}>
                  {LABELS[k].ar}
                </span>
              </div>
              <p className={`text-[5.5rem] font-medium tabular-nums leading-none tracking-tighter ${active ? "text-black" : isNext ? "text-[color:var(--next-ink)]" : useDarkerTimelineText ? "text-[#021b19]" : "text-[color:var(--ink)]"}`}>
                {fmt(times[k], config.tz)}
              </p>
            </motion.div>
          );
        })}
      </footer>
      </div>
      )}

      {showCreatorBadge && <div className="absolute bottom-3 right-3 z-50"><CreatorBadge /></div>}

      <div className="absolute bottom-4 right-4 z-50 opacity-0 hover:opacity-100 transition-opacity">
        <Sheet>
          <SheetTrigger asChild><Button size="icon" variant="ghost"><Settings className="h-4 w-4" /></Button></SheetTrigger>
          <SheetContent className="bg-slate-950 text-white border-white/10 overflow-y-auto">
            <SheetHeader><SheetTitle>Konfiguration</SheetTitle></SheetHeader>

            <div className="mt-4 flex items-center justify-between">
              <Label>Creator-Badge anzeigen</Label>
              <Switch checked={showCreatorBadge} onCheckedChange={setShowCreatorBadge} />
            </div>

            <div className="mt-4"><Label>Moschee Name</Label><Input value={config.name} onChange={(e)=>setConfig({...config, name:e.target.value})} className="bg-white/5 mt-2"/></div>

            <div className="mt-8">
              <Label>Layout</Label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayout(l.id)}
                    className={`rounded-2xl border p-3 text-sm transition ${
                      layout === l.id
                        ? "border-emerald-400 bg-emerald-500/10 text-white"
                        : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {layout === "mihrab" && (
              <div className="mt-8">
                <Label>Mihrab Hintergrund</Label>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {[
                    { id: "selcuklu", label: "Selçuklu", sub: "Rotierendes Medaillon" },
                    { id: "ottoman",  label: "Osmanlı",  sub: "Wappen / Arma" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMihrabBg(opt.id)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        mihrabBg === opt.id
                          ? "border-emerald-400 bg-emerald-500/10 text-white"
                          : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8">
              <Label>Farbschema</Label>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">Automatischer Tag/Nacht-Modus</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Aktiv: {effectiveThemeState.phase === "night" ? "Nacht" : effectiveThemeState.phase === "day" ? "Tag" : "Manuell"}
                  </div>
                </div>
                <Switch
                  checked={autoTheme.enabled}
                  onCheckedChange={(enabled) => setAutoTheme((prev) => ({ ...prev, enabled }))}
                />
              </div>

              {autoTheme.enabled ? (
                <div className="mt-5 flex flex-col gap-5">
                  <div>
                    <Label>Tag-Modus</Label>
                    {renderThemePicker(autoTheme.dayTheme, (dayTheme) =>
                      setAutoTheme((prev) => ({ ...prev, dayTheme }))
                    )}
                  </div>
                  <div>
                    <Label>Nacht-Modus</Label>
                    {renderThemePicker(autoTheme.nightTheme, (nightTheme) =>
                      setAutoTheme((prev) => ({ ...prev, nightTheme }))
                    )}
                  </div>
                </div>
              ) : (
                renderThemePicker(uiTheme, setUiTheme)
              )}
            </div>

            <div className="mt-8">
              <Label>Mond-Design</Label>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {MOON_DESIGNS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setMoonDesign(d.id)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${
                      moonDesign === d.id
                        ? "border-emerald-400 bg-emerald-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <MoonPhase size={64} date={now.toDate()} variant={d.id} />
                    <span className="text-xs text-slate-300">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 mb-6">
              <Label>Religiöse Tage</Label>
              <p className="mt-1 mb-3 text-xs text-slate-400">
                Datum &amp; Zeiten anpassen. „Test“ zeigt den Tag sofort aktiv an (nur zum Prüfen).
              </p>

              {testDayId && (
                <button
                  type="button"
                  onClick={() => setTestDayId(null)}
                  className="mb-3 w-full rounded-lg border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/25"
                >
                  ⚠ Test-Modus aktiv – beenden
                </button>
              )}

              <div className="flex flex-col gap-3">
                {religiousDays.map((ev) => {
                  const isTest = testDayId === ev.id;
                  return (
                    <div
                      key={ev.id}
                      className={`rounded-2xl border p-3 ${isTest ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <textarea
                          value={ev.title}
                          onChange={(e) => updateDay(ev.id, { title: e.target.value })}
                          rows={2}
                          className="flex-1 resize-none bg-transparent text-sm font-medium leading-tight text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setTestDayId(isTest ? null : ev.id)}
                          className={`shrink-0 rounded-lg border px-2 py-1 text-xs ${isTest ? "border-emerald-300 bg-emerald-500 text-black" : "border-white/20 text-slate-200 hover:bg-white/10"}`}
                        >
                          {isTest ? "Test an" : "Test"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={ev.date || ""}
                          onChange={(e) => updateDay(ev.id, { date: e.target.value })}
                          style={{ colorScheme: "dark" }}
                          className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                        />
                      </div>
                      {ev.type === "eid" && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 shrink-0">Sabah</span>
                            <input
                              type="time"
                              value={ev.sabahTime || ""}
                              onChange={(e) => updateDay(ev.id, { sabahTime: e.target.value })}
                              style={{ colorScheme: "dark" }}
                              className="w-full min-w-0 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 shrink-0">Bayram</span>
                            <input
                              type="time"
                              value={ev.prayerTime || ""}
                              onChange={(e) => updateDay(ev.id, { prayerTime: e.target.value })}
                              style={{ colorScheme: "dark" }}
                              className="w-full min-w-0 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

// Alternatives Layout: zentrierter Kreis-Countdown + Zeitleiste
function FocusLayout({ view }) {
  const {
    config, now, hijriText, specialDay, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign, weather,
  } = view;

  const RING_R = 86;
  const C = 2 * Math.PI * RING_R;
  const dashoffset = C * (1 - Math.min(100, Math.max(0, progressPct)) / 100);

  return (
    <div className="h-full w-full p-10 flex flex-col gap-6">
      {/* KOPFZEILE */}
      <header className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-5">
          <img src="\DITIB-Logo.svg.png" alt="Moschee Logo" className="h-14 w-auto object-contain" />
          <div className="flex flex-col min-w-0">
            <h1 className="text-5xl font-medium uppercase tracking-tight leading-none truncate max-w-[42vw]">
              {config.name}
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-3xl text-[color:var(--accent2)] font-bold">
                {now.format("dddd, DD. MMMM")}
              </span>
              {weather && <WeatherBadge weather={weather} iconSize="h-7 w-7" textSize="text-2xl" />}
            </div>
          </div>
        </div>
        <div className="text-7xl font-medium tabular-nums leading-none flex items-baseline drop-shadow-xl">
          {now.format("HH:mm")}
          <span className="text-4xl text-[color:var(--accent)] ml-3 opacity-90">{now.format("ss")}</span>
        </div>
      </header>

      {/* MITTE */}
      <div className="flex-1 flex items-center gap-10 min-h-0">
        {/* Kreis-Countdown */}
        <div className="relative shrink-0" style={{ width: "min(46vh,40vw)", height: "min(46vh,40vw)" }}>
          <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--accent-strong)" }} />
                <stop offset="100%" style={{ stopColor: "var(--accent)" }} />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
            <motion.circle
              cx="100"
              cy="100"
              r={RING_R}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={false}
              animate={{ strokeDashoffset: dashoffset }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ filter: "drop-shadow(0 0 10px var(--accent-glow))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10">
            <p className="text-[color:var(--accent)] text-xl font-medium tracking-[0.3em] uppercase mb-3">
              Nächstes Gebet
            </p>
            <h2 className="text-6xl font-medium leading-none tracking-tight">
              {upcoming.key ? LABELS[upcoming.key].tr : "—"}
            </h2>
            <p className="text-2xl text-[color:var(--accent-light)] uppercase tracking-widest mt-2">
              {upcoming.key ? LABELS[upcoming.key].ar : ""}
            </p>
            <p className="text-7xl font-medium tabular-nums tracking-tighter leading-none mt-6">{remaining}</p>
            <p className="text-xl text-[color:var(--ink-soft)] italic mt-4">
              Beginn um {fmt(upcoming.t, config.tz)} Uhr {upcoming.isTomorrow ? "(Morgen)" : ""}
            </p>
          </div>
        </div>

        {/* Seitenpanel */}
        <div className={`flex-1 h-full rounded-[45px] ${GLASS} border-t-[color:var(--accent2)] border-t-8 p-8 flex flex-col gap-5 min-h-0`}>
          <div className="flex items-center gap-5 shrink-0">
            <MoonPhase size={110} date={now.toDate()} variant={moonDesign} />
            <div className="flex flex-col min-w-0">
              <span className="text-base uppercase tracking-[0.2em] text-[color:var(--ink-soft)] mb-1">
                {getMoonPhaseName(getMoonPhase(now.toDate()))}
              </span>
              <span className="text-3xl font-medium text-[color:var(--accent)] leading-tight">{hijriText}</span>
            </div>
          </div>

          <div className="h-px w-full bg-[var(--surface-border)] shrink-0" />

          <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center overflow-hidden">
            <AnimatePresence mode="wait">
              {specialDay.active ? (
                <motion.div key="special" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center text-center">
                  <SpecialDayPanel specialDay={specialDay} config={config} variant="panel" />
                </motion.div>
              ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div key="ayah" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center" style={{ hyphens: "auto", wordBreak: "break-word" }}>
                  <Quote className="h-9 w-9 text-[color:var(--accent)] mb-3 opacity-30" />
                  <p lang="de" className="font-medium text-[color:var(--ink)] italic leading-[1.25] px-2 text-center" style={{ fontSize: dynamicFontSize, transition: "font-size 0.3s ease" }}>
                    "{randomAyah.text}"
                  </p>
                  <p className="mt-3 text-base text-[color:var(--accent)] font-medium uppercase tracking-widest opacity-70">{randomAyah.ref}</p>
                </motion.div>
              ) : (
                <motion.div key="iqama" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
                  <p className="text-xl text-[color:var(--accent2)] uppercase tracking-[0.3em] mb-1">Aktuell</p>
                  <h3 className="text-4xl font-medium italic mb-4">
                    {currentPrayerKey ? (upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr) : "—"}
                  </h3>
                  <Clock className="h-9 w-9 text-[color:var(--accent)] mb-2 opacity-70" />
                  <p className="text-lg text-[color:var(--ink-soft)] uppercase tracking-widest mb-1">Gamet / Iqama</p>
                  <p className="text-6xl font-medium tabular-nums leading-none">
                    {upcoming.key === "sunrise"
                      ? fmt(dayjs(times.sunrise).subtract(45, "minute"), config.tz)
                      : fmt(dayjs(times[upcoming.key]).add(config.iqama[upcoming.key], "minute"), config.tz)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ZEITLEISTE */}
      <footer className="flex items-stretch gap-4 shrink-0">
        {PRAYER_ORDER.map((k) => {
          const active = currentPrayerKey === k;
          const isNext = upcoming.key === k && (!upcoming.isTomorrow || now.hour() === 0);
          let cls = "bg-[var(--surface-2)] border-[color:var(--surface-border)] text-[color:var(--ink)]";
          if (active) {
            cls = "bg-[var(--accent-strong)] border-[color:var(--accent-light)] text-black shadow-[0_0_40px_var(--accent-glow)]";
          } else if (isNext) {
            cls = "bg-[var(--surface-2)] border-[color:var(--next)] text-[color:var(--next)] shadow-[0_0_30px_var(--next-glow)] animate-pulse-subtle";
          }
          return (
            <div key={k} className={`flex-1 rounded-3xl border-2 px-3 py-4 flex flex-col items-center gap-1 transition-all duration-700 ${cls}`}>
              <span lang="tr" className="text-xl font-medium uppercase tracking-wide leading-none">{LABELS[k].tr}</span>
              <span className="text-4xl font-medium tabular-nums leading-none">{fmt(times[k], config.tz)}</span>
              <span className={`text-sm uppercase ${active ? "text-black/70" : "text-[color:var(--ink-soft)]"}`}>{LABELS[k].ar}</span>
            </div>
          );
        })}
      </footer>
    </div>
  );
}

// Animierter Hintergrund: geometrisches Muster, driftende Lichtkugeln, funkelnde Sterne
function AnimatedBackground() {
  const stars = [
    [12, 18], [24, 70], [40, 30], [58, 14], [70, 60], [82, 28],
    [88, 75], [18, 48], [50, 82], [34, 55], [66, 40], [92, 52],
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* geometrisches Muster */}
      <svg className="absolute inset-0 h-full w-full text-[color:var(--accent)]" style={{ opacity: 0.06 }} aria-hidden="true">
        <defs>
          <pattern id="auroraGeo" width="84" height="84" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1.1">
              <rect x="22" y="22" width="40" height="40" />
              <rect x="22" y="22" width="40" height="40" transform="rotate(45 42 42)" />
              <circle cx="42" cy="42" r="5" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auroraGeo)" />
      </svg>

      {/* driftende Lichtkugeln */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{ width: "42vw", height: "42vw", top: "-10%", left: "-8%", background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{ width: "38vw", height: "38vw", bottom: "-12%", right: "-6%", background: "radial-gradient(circle, var(--accent2-soft) 0%, transparent 70%)" }}
        animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{ width: "30vw", height: "30vw", top: "28%", left: "52%", background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
        animate={{ x: [0, -40, 30, 0], y: [0, 30, -20, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* funkelnde Sterne */}
      {stars.map(([x, y], i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-[color:var(--ink)]"
          style={{ width: 4, height: 4, left: `${x}%`, top: `${y}%` }}
          animate={{ opacity: [0.1, 0.7, 0.1], scale: [0.8, 1.3, 0.8] }}
          transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// Aurora-Layout: aufwändigstes, am stärksten animiertes Design
function AuroraLayout({ view }) {
  const {
    config, now, hijriText, specialDay, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign, weather,
  } = view;

  const RING_R = 88;
  const C = 2 * Math.PI * RING_R;
  const pct = Math.min(100, Math.max(0, progressPct));
  const dashoffset = C * (1 - pct / 100);
  // Winkel des Fortschritts-Kopfes; die -90°-Drehung übernimmt die Gruppe unten
  const ang = ((360 * pct) / 100) * (Math.PI / 180);
  const dotX = 100 + RING_R * Math.cos(ang);
  const dotY = 100 + RING_R * Math.sin(ang);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 h-full w-full p-10 flex flex-col gap-6">
        {/* KOPF */}
        <header className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-5">
            <img src="\DITIB-Logo.svg.png" alt="Moschee Logo" className="h-16 w-auto object-contain drop-shadow-[0_0_20px_var(--accent-glow)]" />
            <div className="flex flex-col min-w-0">
              <h1 className="text-6xl font-medium uppercase tracking-tight leading-none truncate max-w-[44vw]">{config.name}</h1>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-3xl text-[color:var(--accent2)] font-bold">{now.format("dddd, DD. MMMM")}</span>
                {weather && <WeatherBadge weather={weather} iconSize="h-7 w-7" textSize="text-2xl" />}
              </div>
            </div>
          </div>
          <div className="text-8xl font-medium tabular-nums leading-none flex items-baseline drop-shadow-[0_0_30px_var(--accent-glow)]">
            {now.format("HH:mm")}
            <span className="text-4xl text-[color:var(--accent)] ml-3 opacity-90">{now.format("ss")}</span>
          </div>
        </header>

        {/* MITTE */}
        <div className="flex-1 flex items-center gap-10 min-h-0">
          {/* Schwebender Ring mit leuchtendem Punkt */}
          <motion.div
            className="relative shrink-0"
            style={{ width: "min(48vh,40vw)", height: "min(48vh,40vw)" }}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <defs>
                <linearGradient id="auroraRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--accent-strong)" }} />
                  <stop offset="100%" style={{ stopColor: "var(--accent)" }} />
                </linearGradient>
              </defs>
              <g transform="rotate(-90 100 100)">
                <circle cx="100" cy="100" r={RING_R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
                <motion.circle
                  cx="100"
                  cy="100"
                  r={RING_R}
                  fill="none"
                  stroke="url(#auroraRing)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  initial={false}
                  animate={{ strokeDashoffset: dashoffset }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{ filter: "drop-shadow(0 0 12px var(--accent-glow))" }}
                />
                <motion.circle
                  r="7"
                  fill="var(--accent-light)"
                  initial={false}
                  animate={{ cx: dotX, cy: dotY }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{ filter: "drop-shadow(0 0 10px var(--accent))" }}
                />
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-12">
              <p className="text-[color:var(--accent)] text-xl font-medium tracking-[0.3em] uppercase mb-3">Nächstes Gebet</p>
              <h2 className="text-6xl font-medium leading-none tracking-tight">{upcoming.key ? LABELS[upcoming.key].tr : "—"}</h2>
              <p className="text-2xl text-[color:var(--accent-light)] uppercase tracking-widest mt-2">{upcoming.key ? LABELS[upcoming.key].ar : ""}</p>
              <motion.span
                className="mt-6 text-7xl font-medium tabular-nums tracking-tighter leading-none bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(100deg, var(--ink) 0%, var(--ink) 35%, var(--accent) 50%, var(--ink) 65%, var(--ink) 100%)",
                  backgroundSize: "220% 100%",
                }}
                animate={{ backgroundPosition: ["140% 0%", "-40% 0%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              >
                {remaining}
              </motion.span>
              <p className="text-xl text-[color:var(--ink-soft)] italic mt-4">
                Beginn um {fmt(upcoming.t, config.tz)} Uhr {upcoming.isTomorrow ? "(Morgen)" : ""}
              </p>
            </div>
          </motion.div>

          {/* Seitenpanel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className={`flex-1 h-full rounded-[45px] ${GLASS} border-t-[color:var(--accent2)] border-t-8 p-8 flex flex-col gap-5 min-h-0`}
          >
            <div className="flex items-center gap-5 shrink-0">
              <MoonPhase size={120} date={now.toDate()} variant={moonDesign} />
              <div className="flex flex-col min-w-0">
                <span className="text-base uppercase tracking-[0.2em] text-[color:var(--ink-soft)] mb-1">{getMoonPhaseName(getMoonPhase(now.toDate()))}</span>
                <span className="text-3xl font-medium text-[color:var(--accent)] leading-tight">{hijriText}</span>
              </div>
            </div>

            <div className="h-px w-full bg-[var(--surface-border)] shrink-0" />

            <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center overflow-hidden">
              <AnimatePresence mode="wait">
                {specialDay.active ? (
                  <motion.div key="special" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center text-center">
                    <SpecialDayPanel specialDay={specialDay} config={config} variant="panel" />
                  </motion.div>
                ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                  <motion.div key="ayah" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center" style={{ hyphens: "auto", wordBreak: "break-word" }}>
                    <Quote className="h-9 w-9 text-[color:var(--accent)] mb-3 opacity-30" />
                    <p lang="de" className="font-medium text-[color:var(--ink)] italic leading-[1.25] px-2 text-center" style={{ fontSize: dynamicFontSize, transition: "font-size 0.3s ease" }}>
                      "{randomAyah.text}"
                    </p>
                    <p className="mt-3 text-base text-[color:var(--accent)] font-medium uppercase tracking-widest opacity-70">{randomAyah.ref}</p>
                  </motion.div>
                ) : (
                  <motion.div key="iqama" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
                    <p className="text-xl text-[color:var(--accent2)] uppercase tracking-[0.3em] mb-1">Aktuell</p>
                    <h3 className="text-4xl font-medium italic mb-4">{currentPrayerKey ? (upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr) : "—"}</h3>
                    <Clock className="h-9 w-9 text-[color:var(--accent)] mb-2 opacity-70" />
                    <p className="text-lg text-[color:var(--ink-soft)] uppercase tracking-widest mb-1">Gamet / Iqama</p>
                    <p className="text-6xl font-medium tabular-nums leading-none">
                      {upcoming.key === "sunrise"
                        ? fmt(dayjs(times.sunrise).subtract(45, "minute"), config.tz)
                        : fmt(dayjs(times[upcoming.key]).add(config.iqama[upcoming.key], "minute"), config.tz)}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* ZEITLEISTE */}
        <footer className="flex items-stretch gap-4 shrink-0">
          {PRAYER_ORDER.map((k, i) => {
            const active = currentPrayerKey === k;
            const isNext = upcoming.key === k && (!upcoming.isTomorrow || now.hour() === 0);
            let cls = "bg-[var(--surface-2)] border-[color:var(--surface-border)] text-[color:var(--ink)]";
            if (active) {
              cls = "bg-[var(--accent-strong)] border-[color:var(--accent-light)] text-black";
            } else if (isNext) {
              cls = "bg-[var(--surface-2)] border-[color:var(--next)] text-[color:var(--next)]";
            }
            const anim = active
              ? { opacity: 1, y: 0, boxShadow: ["0 0 0px var(--accent-glow)", "0 0 50px var(--accent-glow)", "0 0 0px var(--accent-glow)"] }
              : { opacity: 1, y: 0 };
            const trans = active
              ? { boxShadow: { duration: 2.6, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.5, delay: i * 0.08 }, y: { duration: 0.5, delay: i * 0.08 } }
              : { duration: 0.5, delay: i * 0.08 };
            return (
              <motion.div
                key={k}
                initial={{ opacity: 0, y: 24 }}
                animate={anim}
                transition={trans}
                className={`flex-1 rounded-3xl border-2 px-3 py-4 flex flex-col items-center gap-1 ${cls}`}
              >
                <span lang="tr" className="text-xl font-medium uppercase tracking-wide leading-none">{LABELS[k].tr}</span>
                <span className="text-4xl font-medium tabular-nums leading-none">{fmt(times[k], config.tz)}</span>
                <span className={`text-sm uppercase ${active ? "text-black/70" : "text-[color:var(--ink-soft)]"}`}>{LABELS[k].ar}</span>
              </motion.div>
            );
          })}
        </footer>
      </div>
    </div>
  );
}

// Animierter Hintergrund für das Mihrab-Layout: Zellige-Raster, rotierendes Mandala, Bodenschein
// ── Selçuklu rotating geometric medallion ──────────────────────────────────
function SelcukluBackground() {
  const hexPts = (R, offsetDeg = 0) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((i * 60 + offsetDeg) * Math.PI) / 180;
      return `${(100 + R * Math.sin(a)).toFixed(1)},${(100 - R * Math.cos(a)).toFixed(1)}`;
    }).join(" ");

  const pt = (R, deg) => ({
    x: +(100 + R * Math.sin((deg * Math.PI) / 180)).toFixed(1),
    y: +(100 - R * Math.cos((deg * Math.PI) / 180)).toFixed(1),
  });

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      animate={{ rotate: 360 }}
      transition={{ duration: 150, repeat: Infinity, ease: "linear" }}
    >
      <svg viewBox="0 0 200 200" fill="none" stroke="currentColor"
        className="text-[color:var(--accent2)]"
        style={{ width: "82vh", height: "82vh", opacity: 0.08 }}
        aria-hidden="true">
        <g strokeLinejoin="round">
          <circle cx="100" cy="100" r="96" strokeWidth="1.4" />
          {Array.from({ length: 24 }, (_, i) => {
            const p1 = pt(90, i * 15), p2 = pt(96, i * 15);
            return <line key={`t${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeWidth="1.3" />;
          })}
          <polygon points={hexPts(82, 0)}  strokeWidth="0.95" />
          <polygon points={hexPts(82, 30)} strokeWidth="0.95" />
          {Array.from({ length: 12 }, (_, i) => {
            const o = pt(82, i * 30), i1 = pt(55, i * 30 + 15), i2 = pt(55, i * 30 - 15);
            return (
              <g key={`f1${i}`} strokeWidth="0.65">
                <line x1={o.x} y1={o.y} x2={i1.x} y2={i1.y} />
                <line x1={o.x} y1={o.y} x2={i2.x} y2={i2.y} />
              </g>
            );
          })}
          <circle cx="100" cy="100" r="55" strokeWidth="0.8" />
          <polygon points={hexPts(55, 0)}  strokeWidth="0.85" />
          <polygon points={hexPts(55, 30)} strokeWidth="0.85" />
          {Array.from({ length: 12 }, (_, i) => {
            const o = pt(55, i * 30), i1 = pt(28, i * 30 + 15), i2 = pt(28, i * 30 - 15);
            return (
              <g key={`f2${i}`} strokeWidth="0.6">
                <line x1={o.x} y1={o.y} x2={i1.x} y2={i1.y} />
                <line x1={o.x} y1={o.y} x2={i2.x} y2={i2.y} />
              </g>
            );
          })}
          <circle cx="100" cy="100" r="28" strokeWidth="0.75" />
          <polygon points={hexPts(28, 0)}  strokeWidth="0.8" />
          <polygon points={hexPts(28, 30)} strokeWidth="0.8" />
          <circle cx="100" cy="100" r="12" strokeWidth="0.7" />
          <circle cx="100" cy="100" r="6"  strokeWidth="0.65" />
          {Array.from({ length: 12 }, (_, i) => {
            const p1 = pt(6, i * 30), p2 = pt(12, i * 30);
            return <line key={`p${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} strokeWidth="0.6" />;
          })}
          <circle cx="100" cy="100" r="3" strokeWidth="0.75" />
        </g>
      </svg>
    </motion.div>
  );
}

// ── Ottoman coat of arms watermark ─────────────────────────────────────────
function OttomanBackground() {
  // 5-pointed star polygon points around (cx, cy)
  const starPts = (ro, ri, cx = 0, cy = 0) =>
    Array.from({ length: 10 }, (_, i) => {
      const a = ((i * 36 - 90) * Math.PI) / 180;
      const r = i % 2 === 0 ? ro : ri;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");

  // Spokes of a wheel/rosette from inner radius r1 to outer r2, n spokes
  const spokes = (r1, r2, n, cx, cy) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i * (360 / n)) * Math.PI) / 180;
      return {
        x1: (cx + r1 * Math.cos(a)).toFixed(1), y1: (cy + r1 * Math.sin(a)).toFixed(1),
        x2: (cx + r2 * Math.cos(a)).toFixed(1), y2: (cy + r2 * Math.sin(a)).toFixed(1),
      };
    });

  // Weapon angles (degrees from 12 o'clock, clockwise). 9 per side, mirrored.
  const weaponAngles = [14, 27, 41, 56, 71, 87, 104, 120, 135];
  const weaponLens   = [112, 122, 128, 130, 126, 118, 108,  96,  86];

  return (
    <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ scale: [0.988, 1.012, 0.988], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg
          viewBox="0 0 300 375"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[color:var(--accent2)]"
          style={{ height: "78vh", width: "auto", opacity: 0.09 }}
          aria-hidden="true"
        >
          {/* ══════════════════════════════════════
              RADIATING WEAPONS  (spears / swords / cannons)
              Radiate from (150, 155) – right side + mirror left
          ══════════════════════════════════════ */}
          {weaponAngles.map((deg, i) => {
            const len = weaponLens[i];
            // Right side
            const ar = (deg * Math.PI) / 180;
            const xr = (150 + len * Math.sin(ar)).toFixed(1);
            const yr = (155 - len * Math.cos(ar)).toFixed(1);
            // Left side (mirror)
            const al = ((-deg) * Math.PI) / 180;
            const xl = (150 + len * Math.sin(al)).toFixed(1);
            const yl = (155 - len * Math.cos(al)).toFixed(1);
            return (
              <g key={`wp${i}`} strokeWidth="1.05">
                <line x1="150" y1="155" x2={xr} y2={yr} />
                <circle cx={xr} cy={yr} r="2" strokeWidth="0.8" />
                <line x1="150" y1="155" x2={xl} y2={yl} />
                <circle cx={xl} cy={yl} r="2" strokeWidth="0.8" />
              </g>
            );
          })}

          {/* ══════════════════════════════════════
              SUNBURST MEDALLION  (top circle with tugra)
          ══════════════════════════════════════ */}
          {Array.from({ length: 24 }, (_, i) => {
            const a  = ((i * 15) * Math.PI) / 180;
            const r2 = i % 2 === 0 ? 35 : 30;
            return (
              <line key={`ray${i}`}
                x1={(150 + 22 * Math.sin(a)).toFixed(1)} y1={(56 - 22 * Math.cos(a)).toFixed(1)}
                x2={(150 + r2 * Math.sin(a)).toFixed(1)} y2={(56 - r2 * Math.cos(a)).toFixed(1)}
                strokeWidth={i % 2 === 0 ? "1.3" : "0.8"}
              />
            );
          })}
          <circle cx="150" cy="56" r="22" strokeWidth="1.25" />
          <circle cx="150" cy="56" r="15" strokeWidth="0.8" />
          {/* Tugra suggestion inside */}
          <ellipse cx="150" cy="56" rx="7" ry="4.5" strokeWidth="0.75" />
          <path d="M 143 54 L 157 54 M 145 57 L 155 57 M 147 60 L 153 60" strokeWidth="0.6" />

          {/* ══════════════════════════════════════
              CRESCENT  (below sunburst, opening upward)
              Outer circle: cx=150 cy=115 r=30
              Inner offset: cx=150 cy=105 r=24
              Intersection pts: (128.8, 93.8) & (171.2, 93.8)
          ══════════════════════════════════════ */}
          <path
            d="M 128.8 93.8 A 30 30 0 1 1 171.2 93.8 A 24 24 0 1 0 128.8 93.8 Z"
            strokeWidth="1.2"
          />
          {/* Small star beside crescent */}
          <polygon points={starPts(6, 2.6, 176, 94)} strokeWidth="0.75" />

          {/* ══════════════════════════════════════
              LEFT FLAG  (green / simplified triangle)
          ══════════════════════════════════════ */}
          <path d="M 108 108 L 72 140 L 98 198 L 145 148 Z" strokeWidth="1.1" />
          <path d="M 92 150 A 12 12 0 0 1 114 150 A 9 9 0 0 0 92 150 Z" strokeWidth="0.8" />
          <polygon points={starPts(4, 1.7, 117, 153)} strokeWidth="0.65" />

          {/* ══════════════════════════════════════
              RIGHT FLAG  (red / mirror)
          ══════════════════════════════════════ */}
          <path d="M 192 108 L 228 140 L 202 198 L 155 148 Z" strokeWidth="1.1" />
          <path d="M 186 150 A 12 12 0 0 1 208 150 A 9 9 0 0 0 186 150 Z" strokeWidth="0.8" />
          <polygon points={starPts(4, 1.7, 183, 153)} strokeWidth="0.65" />

          {/* ══════════════════════════════════════
              CENTRAL OVAL SHIELD
          ══════════════════════════════════════ */}
          <ellipse cx="150" cy="163" rx="37" ry="47" strokeWidth="1.4" />
          <ellipse cx="150" cy="163" rx="28" ry="36" strokeWidth="0.7" />
          {Array.from({ length: 16 }, (_, i) => {
            const a = ((i * 22.5) * Math.PI) / 180;
            return (
              <line key={`ov${i}`}
                x1={(150 + 10 * Math.sin(a)).toFixed(1)} y1={(163 - 10 * Math.cos(a)).toFixed(1)}
                x2={(150 + 24 * Math.sin(a)).toFixed(1)} y2={(163 - 24 * Math.cos(a)).toFixed(1)}
                strokeWidth="0.65"
              />
            );
          })}
          <circle cx="150" cy="163" r="9" strokeWidth="0.85" />

          {/* ══════════════════════════════════════
              SCROLLWORK BASE  (baroque ornamental curves)
          ══════════════════════════════════════ */}
          {/* Connecting arch */}
          <path d="M 86 222 C 106 212, 128 208, 150 208 C 172 208, 194 212, 214 222" strokeWidth="1.2" />
          {/* Left scroll */}
          <path d="M 86 222 C 60 230, 46 247, 57 257 C 68 267, 83 256, 87 268 C 91 279, 75 287, 65 282" strokeWidth="1.1" />
          {/* Right scroll (mirror) */}
          <path d="M 214 222 C 240 230, 254 247, 243 257 C 232 267, 217 256, 213 268 C 209 279, 225 287, 235 282" strokeWidth="1.1" />
          {/* Center fleur stem */}
          <line x1="150" y1="208" x2="150" y2="238" strokeWidth="1.1" />
          <path d="M 136 224 C 134 213, 150 208, 150 208 C 150 208, 166 213, 164 224" strokeWidth="1.0" />
          {/* Bottom drop ornament */}
          <path d="M 150 238 C 143 250, 135 255, 132 266 C 129 277, 138 283, 150 283 C 162 283, 171 277, 168 266 C 165 255, 157 250, 150 238 Z" strokeWidth="1.0" />
          <ellipse cx="150" cy="266" rx="8.5" ry="11" strokeWidth="0.7" />

          {/* ══════════════════════════════════════
              HANGING CONNECTIONS
          ══════════════════════════════════════ */}
          <line x1="67"  y1="282" x2="67"  y2="310" strokeWidth="0.9" />
          <line x1="103" y1="285" x2="108" y2="312" strokeWidth="0.9" />
          <line x1="150" y1="283" x2="150" y2="317" strokeWidth="0.9" />
          <line x1="197" y1="285" x2="192" y2="312" strokeWidth="0.9" />
          <line x1="233" y1="282" x2="233" y2="310" strokeWidth="0.9" />

          {/* ══════════════════════════════════════
              BOTTOM MEDALLIONS  (5 pieces)
          ══════════════════════════════════════ */}
          {/* Outer left – 6-pointed star */}
          <polygon points={starPts(13, 6, 67, 324)} strokeWidth="0.9" />
          <circle cx="67" cy="324" r="13" strokeWidth="0.75" />
          <circle cx="67" cy="324" r="4.5" strokeWidth="0.65" />

          {/* Inner left – wheel rosette */}
          <circle cx="108" cy="325" r="13" strokeWidth="0.9" />
          <circle cx="108" cy="325" r="7"  strokeWidth="0.7" />
          {spokes(7, 13, 8, 108, 325).map((s, i) => (
            <line key={`lw${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} strokeWidth="0.75" />
          ))}
          <circle cx="108" cy="325" r="3" strokeWidth="0.65" />

          {/* Center – vertical drop rosette */}
          <ellipse cx="150" cy="342" rx="13" ry="17" strokeWidth="0.9" />
          <ellipse cx="150" cy="342" rx="7.5" ry="10" strokeWidth="0.7" />
          {spokes(5, 8, 8, 150, 342).map((s, i) => (
            <line key={`cw${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} strokeWidth="0.65" />
          ))}

          {/* Inner right – wheel rosette */}
          <circle cx="192" cy="325" r="13" strokeWidth="0.9" />
          <circle cx="192" cy="325" r="7"  strokeWidth="0.7" />
          {spokes(7, 13, 8, 192, 325).map((s, i) => (
            <line key={`rw${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} strokeWidth="0.75" />
          ))}
          <circle cx="192" cy="325" r="3" strokeWidth="0.65" />

          {/* Outer right – 6-pointed star */}
          <polygon points={starPts(13, 6, 233, 324)} strokeWidth="0.9" />
          <circle cx="233" cy="324" r="13" strokeWidth="0.75" />
          <circle cx="233" cy="324" r="4.5" strokeWidth="0.65" />

        </svg>
      </motion.div>
  );
}

// ── Shared wrapper: tile grid + chosen motif + floor glow ──────────────────
function MihrabBackground({ bgStyle = "selcuklu" }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Zellige tile grid */}
      <svg className="absolute inset-0 h-full w-full text-[color:var(--accent)]" style={{ opacity: 0.05 }} aria-hidden="true">
        <defs>
          <pattern id="mihrabTile" width="56" height="96" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M28 2 L54 26 L54 70 L28 94 L2 70 L2 26 Z" />
              <circle cx="28" cy="48" r="6" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mihrabTile)" />
      </svg>

      {bgStyle === "ottoman" ? <OttomanBackground /> : <SelcukluBackground />}

      {/* Bodenschein */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ bottom: "-22%", width: "60vw", height: "55vh", background: "radial-gradient(ellipse at center, var(--accent-glow) 0%, transparent 70%)", filter: "blur(40px)" }}
      />
    </div>
  );
}

// Mihrab-Layout: vertikale Gebetsliste + Moschee-Nische mit wanderndem Licht
function MihrabLayout({ view }) {
  const {
    config, now, hijriText, specialDay, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign, weather, mihrabBg,
  } = view;

  const pct = Math.min(100, Math.max(0, progressPct));

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MihrabBackground bgStyle={mihrabBg} />
      <div className="relative z-10 h-full w-full p-8 grid grid-cols-12 gap-8">
        {/* LINKS: vertikale Gebetsliste */}
        <aside className={`col-span-4 rounded-[40px] ${GLASS} border-l-[color:var(--accent2)] border-l-8 p-7 flex flex-col`}>
          <div className="flex items-center gap-4 mb-5 shrink-0">
            <img src="\DITIB-Logo.svg.png" alt="Moschee Logo" className="h-12 w-auto object-contain" />
            <div className="min-w-0 flex-1">
              <h1
                className="font-medium uppercase tracking-tight max-w-full whitespace-normal"
                style={fittedMosqueTitleStyle}
              >
                {config.name}
              </h1>
              <span className="text-3xl text-[color:var(--accent2)] font-bold leading-tight">{now.format("dddd, DD. MMMM")}</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {PRAYER_ORDER.map((k, i) => {
              const active = currentPrayerKey === k;
              const isNext = upcoming.key === k && (!upcoming.isTomorrow || now.hour() === 0);
              let rowCls = "bg-[var(--surface-2)] border-[color:var(--surface-border)] text-[color:var(--ink)]";
              let dot = "var(--accent)";
              if (active) {
                rowCls = "bg-[var(--accent-strong)] border-[color:var(--accent-light)] text-black shadow-[0_0_45px_var(--accent-glow)]";
                dot = "#000000";
              } else if (isNext) {
                rowCls = "bg-[var(--surface-2)] border-[color:var(--next)] text-[color:var(--next)]";
                dot = "var(--next)";
              }
              return (
                <motion.div
                  key={k}
                  initial={{ opacity: 0, x: -28 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.07 }}
                  className={`flex-1 rounded-2xl border-2 px-5 py-2 flex items-center justify-between overflow-visible ${rowCls}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <motion.span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: dot }}
                      animate={active ? { scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 1 }}
                      transition={active ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
                    />
                    <div className="flex flex-col min-w-0 overflow-visible">
                      <span lang="tr" className="text-6xl font-medium uppercase tracking-tight leading-[1.08] whitespace-nowrap overflow-visible pb-1">{LABELS[k].tr}</span>
                      <span className={`text-3xl uppercase leading-[1.08] pb-0.5 ${active ? "text-black/70" : "text-[color:var(--ink-soft)]"}`}>{LABELS[k].ar}</span>
                    </div>
                  </div>
                  <span className="text-7xl font-medium tabular-nums tracking-tight leading-[1.05] pb-1">{fmt(times[k], config.tz)}</span>
                </motion.div>
              );
            })}
          </div>
        </aside>

        {/* RECHTS: Uhr, Nische, Inhalts-Band */}
        <main className="col-span-8 flex flex-col gap-6 min-h-0">
          {/* Uhr + Mond */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-6">
              <MoonPhase size={170} date={now.toDate()} variant={moonDesign} />
              <div className="flex flex-col">
                <span className="text-3xl uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">{getMoonPhaseName(getMoonPhase(now.toDate()))}</span>
                <span className="text-6xl font-medium text-[color:var(--accent)] leading-tight">{hijriText}</span>
              </div>
              {weather && <div className="ml-8"><AnimatedWeatherWidget weather={weather} /></div>}
            </div>
            <div className="text-9xl font-medium tabular-nums leading-[1.05] flex items-baseline drop-shadow-[0_0_24px_var(--accent-glow)] pb-1">
              {now.format("HH:mm")}
              <span className="text-5xl text-[color:var(--accent)] ml-3 opacity-90">{now.format("ss")}</span>
            </div>
          </div>

          {/* Mihrab-Nische */}
          <div className="flex-1 relative flex items-center justify-center min-h-0">
            <div className="relative h-full" style={{ aspectRatio: "100 / 130" }}>
              <svg viewBox="0 0 100 130" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="archGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: "var(--accent)" }} />
                    <stop offset="100%" style={{ stopColor: "var(--accent-strong)" }} />
                  </linearGradient>
                </defs>
                <path d={ARCH_PATH} fill="var(--surface)" stroke="url(#archGrad)" strokeWidth="1.2" />
                <motion.path
                  d={ARCH_PATH}
                  fill="none"
                  stroke="var(--accent-light)"
                  strokeWidth="1.8"
                  pathLength={1}
                  strokeDasharray="0.08 0.92"
                  animate={{ strokeDashoffset: [0, -1] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  style={{ filter: "drop-shadow(0 0 3px var(--accent))" }}
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" style={{ paddingTop: "13%" }}>
                <p className="text-[color:var(--accent)] text-2xl font-medium tracking-[0.3em] uppercase mb-3">Nächstes Gebet</p>
                <h2 className="text-8xl font-medium leading-[1.08] tracking-tight pb-1">{upcoming.key ? LABELS[upcoming.key].tr : "—"}</h2>
                <p className="text-4xl text-[color:var(--accent-light)] uppercase tracking-widest leading-[1.1] mt-3 pb-1">{upcoming.key ? LABELS[upcoming.key].ar : ""}</p>
                <p className="text-[9rem] font-medium tabular-nums tracking-tighter leading-[1.05] mt-5 whitespace-nowrap pb-2">{remaining}</p>
                <div className="w-[78%] h-6 rounded-full bg-[var(--surface-2)] border border-[color:var(--surface-border)] overflow-hidden mt-7">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent)] shadow-[0_0_20px_var(--accent-glow)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <p className="text-3xl text-[color:var(--ink-soft)] italic mt-5">
                  Beginn um {fmt(upcoming.t, config.tz)} Uhr {upcoming.isTomorrow ? "(Morgen)" : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Inhalts-Band */}
          <div className={`shrink-0 rounded-[30px] ${GLASS} px-8 py-5 flex items-center justify-center text-center overflow-visible`} style={{ minHeight: "19%" }}>
            <AnimatePresence mode="wait">
              {specialDay.active ? (
                <motion.div key="special" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
                  <SpecialDayPanel specialDay={specialDay} config={config} variant="band" />
                </motion.div>
              ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div key="ayah" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center" style={{ hyphens: "auto", wordBreak: "break-word" }}>
                  <p lang="de" className="font-medium text-[color:var(--ink)] italic leading-snug text-center" style={{ fontSize: `min(${dynamicFontSize}, 2rem)`, transition: "font-size 0.3s ease" }}>"{randomAyah.text}"</p>
                  <p className="mt-2 text-xl text-[color:var(--accent)] font-medium uppercase tracking-widest opacity-70">{randomAyah.ref}</p>
                </motion.div>
              ) : (
                <motion.div key="iqama" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-12">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl text-[color:var(--accent2)] uppercase tracking-[0.2em]">Aktuell</span>
                    <span className="text-5xl font-medium italic leading-[1.12] pb-1">{currentPrayerKey ? (upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr) : "—"}</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl text-[color:var(--ink-soft)] uppercase tracking-widest">Gamet / Iqama</span>
                    <span className="text-6xl font-medium tabular-nums text-[color:var(--accent)] leading-[1.08] pb-1">
                      {upcoming.key === "sunrise"
                        ? fmt(dayjs(times.sunrise).subtract(45, "minute"), config.tz)
                        : fmt(dayjs(times[upcoming.key]).add(config.iqama[upcoming.key], "minute"), config.tz)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

// Horizont-Layout: der Tag als Himmelsbogen – Sonne bzw. Mond wandern über die Bahn,
// die Gebete sind Stationen an ihrer tatsächlichen Tageszeit
function HorizonLayout({ view }) {
  const {
    config, now, hijriText, specialDay, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, moonDesign, weather,
  } = view;

  // Bruchteil des Tages (0 = Mitternacht, 1 = nächste Mitternacht)
  const dayFrac = (d) => {
    const t = dayjs(d).tz(config.tz);
    return (t.hour() * 3600 + t.minute() * 60 + t.second()) / 86400;
  };

  // Elliptischer Tagesbogen: Punkt für einen Tagesbruchteil, optional nach außen versetzt
  const CX = 500, CY = 350, RX = 455, RY = 260;
  const arcPoint = (frac, extra = 0) => {
    const a = Math.PI * (1 - frac);
    return { x: CX + (RX + extra) * Math.cos(a), y: CY - (RY + extra) * Math.sin(a) };
  };
  const ARC_D = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`;

  const nowFrac = dayFrac(now);
  const isDay = now.isAfter(dayjs(times.sunrise)) && now.isBefore(dayjs(times.maghrib));
  const orb = arcPoint(nowFrac);

  const stars = [
    [6, 18], [14, 38], [22, 12], [34, 26], [46, 8], [58, 20],
    [68, 34], [78, 10], [88, 24], [94, 40], [40, 44], [72, 48],
  ];

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Horizontschein am Boden */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: "50%",
          background: "radial-gradient(ellipse at 50% 115%, var(--accent-glow) 0%, transparent 68%)",
          opacity: 0.45,
          filter: "blur(28px)",
        }}
      />
      {/* Funkelnde Sterne, nur nachts */}
      {!isDay && stars.map(([x, y], i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-[color:var(--ink)] pointer-events-none"
          style={{ width: 4, height: 4, left: `${x}%`, top: `${y}%` }}
          animate={{ opacity: [0.1, 0.65, 0.1], scale: [0.8, 1.25, 0.8] }}
          transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.35, ease: "easeInOut" }}
        />
      ))}

      <div className="relative z-10 h-full w-full px-10 pt-8 pb-8 flex flex-col gap-5">
        {/* KOPF */}
        <header className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-5">
            <img src="\DITIB-Logo.svg.png" alt="Moschee Logo" className="h-14 w-auto object-contain" />
            <div className="flex flex-col min-w-0">
              <h1 className="text-5xl font-medium uppercase tracking-tight leading-none truncate max-w-[46vw]">
                {config.name}
              </h1>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-3xl text-[color:var(--accent2)] font-bold">{now.format("dddd, DD. MMMM")}</span>
                {weather && <WeatherBadge weather={weather} iconSize="h-7 w-7" textSize="text-2xl" />}
              </div>
            </div>
          </div>
          <div className="text-8xl font-medium tabular-nums leading-none flex items-baseline drop-shadow-[0_0_28px_var(--accent-glow)]">
            {now.format("HH:mm")}
            <span className="text-4xl text-[color:var(--accent)] ml-3 opacity-90">{now.format("ss")}</span>
          </div>
        </header>

        {/* TAGESBOGEN */}
        <div className="flex-1 relative min-h-0">
          <svg viewBox="0 0 1000 380" preserveAspectRatio="xMidYMax meet" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id="horizonArcGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" style={{ stopColor: "var(--accent-strong)" }} />
                <stop offset="55%" style={{ stopColor: "var(--accent)" }} />
                <stop offset="100%" style={{ stopColor: "var(--accent-light)" }} />
              </linearGradient>
              <radialGradient id="horizonOrbGrad" cx="38%" cy="34%" r="75%">
                <stop offset="0%" stopColor={isDay ? "#fff7da" : "#ffffff"} />
                <stop offset="100%" stopColor={isDay ? "#f59e0b" : "#94a3b8"} />
              </radialGradient>
            </defs>

            {/* Horizontlinie */}
            <line x1={CX - RX - 25} y1={CY} x2={CX + RX + 25} y2={CY} stroke="var(--surface-border)" strokeWidth="2" />

            {/* Bahn: kommender Teil + zurückgelegter Teil */}
            <path d={ARC_D} fill="none" stroke="var(--surface-2)" strokeWidth="5" strokeLinecap="round" />
            <path
              d={ARC_D}
              fill="none"
              stroke="url(#horizonArcGrad)"
              strokeWidth="5"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${nowFrac} 1`}
              style={{ filter: "drop-shadow(0 0 7px var(--accent-glow))" }}
            />

            {/* Gebets-Stationen entlang der Bahn */}
            {PRAYER_ORDER.map((k) => {
              const f = dayFrac(times[k]);
              const p = arcPoint(f);
              // Güneş und Yatsı liegen zeitlich dicht an ihren Nachbarn – ihre
              // Beschriftung wandert auf die Innenseite des Bogens
              const inner = k === "sunrise" || k === "isha";
              const tick = arcPoint(f, inner ? -30 : 30);
              const lbl = arcPoint(f, inner ? -108 : 100);
              const lblX = Math.min(905, Math.max(95, lbl.x));
              const active = currentPrayerKey === k;
              const isNext = upcoming.key === k && (!upcoming.isTomorrow || now.hour() === 0);
              const col = active ? "var(--accent)" : isNext ? "var(--next)" : "var(--ink-soft)";
              return (
                <g key={k}>
                  <line x1={p.x} y1={p.y} x2={tick.x} y2={tick.y} stroke={col} strokeWidth="2" opacity="0.6" />
                  {isNext && (
                    <motion.circle
                      cx={p.x}
                      cy={p.y}
                      fill="none"
                      stroke="var(--next)"
                      strokeWidth="2"
                      animate={{ r: [10, 22, 10], opacity: [0.9, 0, 0.9] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={active || isNext ? 10 : 7}
                    fill={f <= nowFrac ? col : "var(--surface)"}
                    stroke={col}
                    strokeWidth="2.5"
                    style={active || isNext ? { filter: `drop-shadow(0 0 8px ${active ? "var(--accent-glow)" : "var(--next-glow)"})` } : undefined}
                  />
                  <text
                    x={lblX}
                    y={lbl.y - 22}
                    textAnchor="middle"
                    fill={active ? "var(--accent)" : isNext ? "var(--next)" : "var(--ink)"}
                    fontSize="36"
                    fontWeight="600"
                    style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
                    lang="tr"
                  >
                    {LABELS[k].tr}
                  </text>
                  <text
                    x={lblX}
                    y={lbl.y + 26}
                    textAnchor="middle"
                    fill={active || isNext ? col : "var(--ink)"}
                    fontSize="46"
                    fontWeight="500"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmt(times[k], config.tz)}
                  </text>
                </g>
              );
            })}

            {/* Wandernde Sonne / Mond an der aktuellen Uhrzeit */}
            <g>
              <circle
                cx={orb.x}
                cy={orb.y}
                r="34"
                fill={isDay ? "rgba(245,158,11,0.25)" : "rgba(226,232,240,0.18)"}
                style={{ filter: "blur(10px)" }}
              />
              {isDay && (
                <motion.g
                  animate={{ opacity: [0.45, 0.95, 0.45] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  {Array.from({ length: 8 }).map((_, i) => (
                    <line
                      key={i}
                      x1={orb.x}
                      y1={orb.y - 24}
                      x2={orb.x}
                      y2={orb.y - 31}
                      stroke="#fde68a"
                      strokeWidth="3"
                      strokeLinecap="round"
                      transform={`rotate(${i * 45} ${orb.x} ${orb.y})`}
                    />
                  ))}
                </motion.g>
              )}
              <circle
                cx={orb.x}
                cy={orb.y}
                r="16"
                fill="url(#horizonOrbGrad)"
                style={{ filter: `drop-shadow(0 0 14px ${isDay ? "rgba(245,158,11,0.8)" : "rgba(226,232,240,0.75)"})` }}
              />
            </g>
          </svg>

          {/* Countdown im Inneren des Bogens */}
          <div className="absolute inset-x-0 bottom-[9%] flex flex-col items-center text-center pointer-events-none">
            <p className="text-[color:var(--accent)] text-2xl font-medium tracking-[0.3em] uppercase mb-2">Nächstes Gebet</p>
            <h2 className="text-7xl font-medium leading-none tracking-tight">
              {upcoming.key ? LABELS[upcoming.key].tr : "—"}
              {upcoming.key && (
                <span className="text-[color:var(--accent-light)] text-4xl uppercase tracking-widest ml-5">{LABELS[upcoming.key].ar}</span>
              )}
            </h2>
            <p className="text-[7.5rem] font-medium tabular-nums tracking-tighter leading-none mt-4">{remaining}</p>
            <p className="text-2xl text-[color:var(--ink-soft)] italic mt-3">
              Beginn um {fmt(upcoming.t, config.tz)} Uhr {upcoming.isTomorrow ? "(Morgen)" : ""}
            </p>
          </div>
        </div>

        {/* FUSSBAND: Mond & Hijri + Ayah / Iqama / religiöser Tag */}
        <footer className={`shrink-0 rounded-[30px] ${GLASS} border-t-[color:var(--accent2)] border-t-4 px-8 py-4 flex items-center gap-8`} style={{ minHeight: "17%" }}>
          <div className="flex items-center gap-4 shrink-0">
            <MoonPhase size={100} date={now.toDate()} variant={moonDesign} />
            <div className="flex flex-col">
              <span className="text-sm uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">
                {getMoonPhaseName(getMoonPhase(now.toDate()))}
              </span>
              <span className="text-2xl font-medium text-[color:var(--accent)] leading-tight">{hijriText}</span>
            </div>
          </div>
          <div className="self-stretch w-px bg-[var(--surface-border)] shrink-0" />
          <div className="flex-1 min-w-0 flex items-center justify-center text-center overflow-hidden">
            <AnimatePresence mode="wait">
              {specialDay.active ? (
                <motion.div key="special" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
                  <SpecialDayPanel specialDay={specialDay} config={config} variant="band" />
                </motion.div>
              ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div key="ayah" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center" style={{ hyphens: "auto", wordBreak: "break-word" }}>
                  <p lang="de" className="font-medium text-[color:var(--ink)] italic leading-snug text-center" style={{ fontSize: `min(${dynamicFontSize}, 1.8rem)`, transition: "font-size 0.3s ease" }}>
                    "{randomAyah.text}"
                  </p>
                  <p className="mt-2 text-lg text-[color:var(--accent)] font-medium uppercase tracking-widest opacity-70">{randomAyah.ref}</p>
                </motion.div>
              ) : (
                <motion.div key="iqama" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-12">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl text-[color:var(--accent2)] uppercase tracking-[0.2em]">Aktuell</span>
                    <span className="text-5xl font-medium italic leading-[1.12] pb-1">
                      {currentPrayerKey ? (upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr) : "—"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl text-[color:var(--ink-soft)] uppercase tracking-widest">Gamet / Iqama</span>
                    <span className="text-6xl font-medium tabular-nums text-[color:var(--accent)] leading-[1.08] pb-1">
                      {upcoming.key === "sunrise"
                        ? fmt(dayjs(times.sunrise).subtract(45, "minute"), config.tz)
                        : fmt(dayjs(times[upcoming.key]).add(config.iqama[upcoming.key], "minute"), config.tz)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </footer>
      </div>
    </div>
  );
}
