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
import { Settings, Maximize2, MapPin, Clock, Quote } from "lucide-react";
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

const toDateWithTime = (baseDate, hhmm, tz = DEFAULT_TZ) => {
  const dateStr = dayjs(baseDate).format("YYYY-MM-DD");
  return dayjs.tz(`${dateStr} ${hhmm}`, "YYYY-MM-DD HH:mm", tz);
};
const fmt = (d, tz = DEFAULT_TZ) => (d ? dayjs(d).tz(tz).format("HH:mm") : "--:--");

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
      "--next": "#fb923c",
      "--next-border": "#fed7aa",
      "--next-glow": "rgba(251,146,60,0.40)",
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

const GLASS = "bg-[var(--surface)] border-[color:var(--surface-border)] backdrop-blur-3xl shadow-2xl";

// Neutralfarben (Text/Flächen). Standard = dunkles Design; helle Themes überschreiben sie.
const NEUTRAL_DARK = {
  "--ink": "#ffffff",
  "--ink-soft": "#94a3b8",
  "--surface": "rgba(15,23,42,0.6)",
  "--surface-border": "rgba(255,255,255,0.10)",
  "--surface-2": "rgba(255,255,255,0.05)",
};

// Auswählbare Layouts (Gesamtstruktur der Oberfläche)
const LAYOUTS = [
  { id: "classic", label: "Klassisch" },
  { id: "focus",   label: "Fokus" },
  { id: "aurora",  label: "Aurora" },
  { id: "mihrab",  label: "Mihrab" },
];

// Umriss einer Moschee-Nische (Mihrab-Bogen)
const ARCH_PATH = "M 8 128 L 8 52 Q 10 12 50 5 Q 90 12 92 52 L 92 128 Z";

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
  const [layout, setLayout] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_layout") : null;
    return saved && LAYOUTS.some((l) => l.id === saved) ? saved : "classic";
  });
  const lastFetchRef = useRef(0);

  const theme = useMemo(
    () => UI_THEMES.find((t) => t.id === uiTheme) || UI_THEMES[0],
    [uiTheme]
  );

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_moon_design", moonDesign);
  }, [moonDesign]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_ui_theme", uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("prayer_layout", layout);
  }, [layout]);

  const today = useMemo(() => now.startOf("day"), [now]);

  const hijriText = useMemo(() => {
    const key = today.format("YYYY-MM-DD");
    return calendar?.[key]?.hijri || "--";
  }, [calendar, today]);

  const eidInfo = useMemo(() => {
    const eidDateStr = config?.eidAlFitr?.date;
    const sabahTimeStr = config?.eidAlFitr?.sabahTime;
    const eidPrayerTimeStr = config?.eidAlFitr?.prayerTime;

    if (!eidDateStr || !sabahTimeStr || !eidPrayerTimeStr) {
      return {
        active: false,
        isEidDay: false,
        daysLeft: null,
        sabahDateTime: null,
        eidPrayerDateTime: null,
      };
    }

    const eidDay = dayjs.tz(eidDateStr, config.tz).startOf("day");
    const diffDays = eidDay.diff(today, "day");

    const active = diffDays >= 0 && diffDays <= 8;
    const isEidDay = diffDays === 0;

    const sabahDateTime = toDateWithTime(eidDay, sabahTimeStr).toDate();
    const eidPrayerDateTime = toDateWithTime(eidDay, eidPrayerTimeStr).toDate();

    return {
      active,
      isEidDay,
      daysLeft: diffDays,
      sabahDateTime,
      eidPrayerDateTime,
    };
  }, [config, today]);

  // Dynamische Berechnung der Schriftgröße basierend auf der Zeichenanzahl
  const dynamicFontSize = useMemo(() => {
    const len = randomAyah.text.length;
    if (len < 50) return "3.5rem";   // Sehr kurz
    if (len < 100) return "2.8rem";  // Kurz
    if (len < 150) return "2.4rem";  // Mittel
    if (len < 200) return "2.1rem";  // Lang
    if (len < 250) return "1.9rem";
    if (len < 300) return "1.7rem";
    if (len < 350) return "1.5rem";
    return "1.4rem";                 // Sehr lang (bis 400 chars)
  }, [randomAyah.text]);

  const fetchRandomAyah = async (force = false) => {
    const currentTime = Date.now();
    if (!force && currentTime - lastFetchRef.current < 600000) return;

    let found = false;
    let attempts = 0;

    while (!found && attempts < 10) {
      try {
        attempts++;
        const randomId = Math.floor(Math.random() * 6236) + 1;
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${randomId}/de.bubenheim`);
        const data = await res.json();
        
        if (data.status === "OK") {
          const text = data.data.text;
          if (text.length <= 400) {
            setRandomAyah({
              text: text,
              ref: `${data.data.surah.englishName} (${data.data.surah.number}:${data.data.numberInSurah})`
            });
            lastFetchRef.current = currentTime;
            found = true;
          }
        }
      } catch (e) {
        setRandomAyah({ text: "Gedenkt Meiner, so gedenke Ich eurer.", ref: "(2:152)" });
        found = true;
      }
    }
  };

  useEffect(() => {
    fetch("/diyanet-geislingen-2026.json").then(res => res.json()).then(setCalendar).catch(console.error);
    fetchRandomAyah(true);
  }, []);

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

  const view = {
    config, now, hijriText, eidInfo, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign,
  };

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
      ) : (
      <div className="h-full w-full p-8 flex flex-col justify-between">
      {/* HEADER */}
      <header className="flex items-center justify-between h-[15%]">
        <div className="flex flex-col gap-2 max-w-[75%]">
          <div className="flex items-center gap-6">
            <img
              src="\DITIB-Logo.svg.png"
              alt="Moschee Logo"
              className="h-16 w-auto object-contain"
            />

            <h1 className="text-7xl font-medium tracking-tight uppercase leading-none truncate drop-shadow-lg">
              {config.name}
            </h1>
          </div>
          <div className="flex gap-6 items-center">
            <span className="text-5xl text-[color:var(--accent2)] font-bold mt-6">
              {now.format("dddd, DD. MMMM")}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="text-[10rem] font-medium tabular-nums leading-none flex items-baseline drop-shadow-2xl">
            {now.format("HH:mm")}
            <span className="text-6xl text-[color:var(--accent)] font-medium ml-6 tracking-[0.1em] opacity-90">{now.format("ss")}</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="grid grid-cols-12 gap-8 h-[55%] my-4">
        <Card className={`col-span-8 rounded-[55px] ${glass} border-t-[color:var(--accent)] border-t-8 flex flex-col`}>
          <CardContent className="p-12 h-full flex flex-col justify-between overflow-hidden">
            <div>
              <p className="text-[color:var(--accent)] text-2xl font-medium tracking-[0.3em] uppercase mb-6 flex items-center gap-4">
                <span className="w-14 h-1.5 bg-[var(--accent)]" /> Nächstes Gebet
              </p>
              <h2 className="text-[7.5rem] font-medium leading-none tracking-tighter">
                {upcoming.key ? (
                  <>{LABELS[upcoming.key].tr} <span className="text-[color:var(--ink-soft)] font-thin text-[7.5rem] mx-4">/</span> <span className="text-[color:var(--accent-light)] text-[7.5rem]">{LABELS[upcoming.key].ar}</span></>
                ) : "—"}
              </h2>
              <p className="text-5xl font-bold text-[color:var(--ink-soft)] mt-6 tracking-tight italic mt-12">
                Beginn um {fmt(upcoming.t, config.tz)} Uhr {upcoming.isTomorrow ? "(Morgen)" : ""}
              </p>
            </div>

            <div className="flex justify-between items-end gap-8">
              <div className="w-[52%]">
                <p lang="de" className="text-[color:var(--ink-soft)] text-2xl font-medium mb-3 uppercase tracking-widest">Verbleibend</p>
                <p className="text-[8rem] font-medium tabular-nums tracking-tighter leading-none">{remaining}</p>
                <div className="h-7 w-full bg-[var(--surface-2)] rounded-full mt-8 overflow-hidden border border-[color:var(--surface-border)] p-1 shadow-inner">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} className="h-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent)] rounded-full shadow-[0_0_40px_var(--accent-glow)]" />
                </div>
              </div>

              <div className="w-[42%] flex items-center justify-center gap-7 bg-[var(--surface-2)] px-10 py-6 rounded-[35px] border border-[color:var(--surface-border)] shadow-xl">
                <MoonPhase size={140} date={now.toDate()} variant={moonDesign} />
                <div className="flex flex-col text-[color:var(--accent)] min-w-0">
                  <span className="text-xl uppercase tracking-[0.2em] text-[color:var(--ink-soft)] mb-2">
                    {getMoonPhaseName(getMoonPhase(now.toDate()))}
                  </span>
                  <span className="text-4xl font-medium leading-tight">
                    {hijriText}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RECHTS: AKTUELL / ZITAT */}
        <Card className={`col-span-4 rounded-[55px] ${glass} p-12 flex flex-col justify-between border-t-[color:var(--accent2)] border-t-8 overflow-hidden h-full`}>
          {!eidInfo.active && (
            <div className="h-[25%] shrink-0">
              <p className="text-[color:var(--accent2)] text-2xl font-medium tracking-[0.3em] uppercase mb-2">Aktuell</p>
              <h3 className="text-5xl font-medium leading-tight italic truncate">
                {currentPrayerKey ? (
                  <>{upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr} <span className="text-[color:var(--ink-soft)] text-3xl">/ {LABELS[currentPrayerKey].ar}</span></>
                ) : "—"}
              </h3>
              <p className="text-3xl font-bold text-[color:var(--ink-soft)] mt-1 tabular-nums">
                Seit {fmt(times[currentPrayerKey], config.tz)}
              </p>
            </div>
          )}

            <div className={`bg-[var(--surface-2)] rounded-[45px] p-6 text-center border border-[color:var(--surface-border)] shadow-inner flex flex-col justify-center items-center overflow-hidden ${eidInfo.active ? "h-full" : "h-[72%]"}`}>            <AnimatePresence mode="wait">
              {eidInfo.active ? (
                <motion.div
                  key="eid-info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex flex-col items-center justify-center text-center px-4"
                >
                  <p className="whitespace-pre-line text-3xl font-medium text-[color:var(--accent2)] uppercase tracking-[0.25em] mb-6">
                    {config.eidAlFitr?.title || "Eid al-Fitr"}
                  </p>

                  <h4 className="text-3xl font-medium leading-tight text-[color:var(--ink)] mb-10">
                    {eidInfo.isEidDay
                      ? "Heute ist Eid"
                      : `Noch ${eidInfo.daysLeft} ${eidInfo.daysLeft === 1 ? "Tag" : "Tage"} bis Bayram / Eid`}
                  </h4>

                  <div className="w-full grid grid-cols-2 gap-8">
                    <div className="bg-[var(--surface-2)] rounded-[32px] border border-[color:var(--surface-border)] p-10 flex flex-col items-center">
                      <p className="text-2xl text-[color:var(--ink-soft)] uppercase tracking-widest mb-4">
                        Fajr
                      </p>
                      <p className="text-[5rem] font-medium leading-none tabular-nums text-[color:var(--ink)]">
                        {fmt(eidInfo.sabahDateTime, config.tz)}
                      </p>
                      <p className="mt-4 text-2xl text-[color:var(--ink-soft)]">
                        Sabah
                      </p>
                    </div>

                  <div className="bg-[var(--accent2-soft)] rounded-[32px] border border-[color:var(--accent2-soft)] p-10 flex flex-col items-center">
                      <p className="text-2xl text-[color:var(--accent2)] uppercase tracking-widest mb-4">
                        EId-Gebet
                      </p>
                      <p className="text-[5rem] font-medium leading-none tabular-nums text-[color:var(--accent-light)]">
                        {fmt(eidInfo.eidPrayerDateTime, config.tz)}
                      </p>
                      <p className="mt-4 text-2xl text-[color:var(--accent2)]">
                        Bayram namazı
                      </p>
                    </div>
                  </div>

                  <p className="mt-8 text-3xl text-[color:var(--ink-soft)]">
                    {dayjs(config.eidAlFitr?.date).format("DD.MM.YYYY")}
                  </p>
                </motion.div>
              ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div
                  key="ayah"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
      <footer className="grid grid-cols-6 gap-6 h-[22%] mb-2">
        {PRAYER_ORDER.map((k) => {
          const active = currentPrayerKey === k;

          const isNext =
            upcoming.key === k &&
            (!upcoming.isTomorrow || now.hour() === 0);

          // Logik für die dynamischen Klassen
          let statusClasses = "bg-[var(--surface-2)] border-transparent opacity-90 text-[color:var(--ink)]"; // Standard (Vergangen/Zukünftig)

          if (active) {
            statusClasses = "bg-[var(--accent-strong)] border-[color:var(--accent-light)] shadow-[0_0_80px_var(--accent-glow)] scale-110 z-20 text-black";
          } else if (isNext) {
            // Hervorhebung für das nächste Gebet
            statusClasses = "bg-[var(--next)] border-[color:var(--next-border)] shadow-[0_0_60px_var(--next-glow)] z-10 text-white animate-pulse-subtle";
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
                <span className={`text-2xl font-bold opacity-70 uppercase leading-none mt-2 ${active ? "text-black" : "text-[color:var(--ink-soft)]"}`}>
                  {LABELS[k].ar}
                </span>
              </div>
              <p className={`text-[5.5rem] font-medium tabular-nums leading-none tracking-tighter ${active ? "text-black" : "text-[color:var(--ink)]"}`}>
                {fmt(times[k], config.tz)}
              </p>
            </motion.div>
          );
        })}
      </footer>
      </div>
      )}

      <div className="absolute bottom-4 right-4 z-50 opacity-0 hover:opacity-100 transition-opacity">
        <Sheet>
          <SheetTrigger asChild><Button size="icon" variant="ghost"><Settings className="h-4 w-4" /></Button></SheetTrigger>
          <SheetContent className="bg-slate-950 text-white border-white/10">
            <SheetHeader><SheetTitle>Konfiguration</SheetTitle></SheetHeader>
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

            <div className="mt-8">
              <Label>Farbschema</Label>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {UI_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setUiTheme(t.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                      uiTheme === t.id
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
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

// Alternatives Layout: zentrierter Kreis-Countdown + Zeitleiste
function FocusLayout({ view }) {
  const {
    config, now, hijriText, eidInfo, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign,
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
            <span className="text-3xl text-[color:var(--accent2)] font-bold mt-2">
              {now.format("dddd, DD. MMMM")}
            </span>
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
              {eidInfo.active ? (
                <motion.div key="eid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center">
                  <p className="whitespace-pre-line text-2xl font-medium text-[color:var(--accent2)] uppercase tracking-[0.25em] mb-4">
                    {config.eidAlFitr?.title || "Eid al-Fitr"}
                  </p>
                  <h4 className="text-2xl font-medium mb-6">
                    {eidInfo.isEidDay
                      ? "Heute ist Eid"
                      : `Noch ${eidInfo.daysLeft} ${eidInfo.daysLeft === 1 ? "Tag" : "Tage"} bis Bayram / Eid`}
                  </h4>
                  <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="bg-[var(--surface-2)] rounded-3xl border border-[color:var(--surface-border)] p-6">
                      <p className="text-lg text-[color:var(--ink-soft)] uppercase tracking-widest mb-2">Sabah</p>
                      <p className="text-5xl font-medium tabular-nums">{fmt(eidInfo.sabahDateTime, config.tz)}</p>
                    </div>
                    <div className="bg-[var(--accent2-soft)] rounded-3xl border border-[color:var(--accent2-soft)] p-6">
                      <p className="text-lg text-[color:var(--accent2)] uppercase tracking-widest mb-2">Eid-Gebet</p>
                      <p className="text-5xl font-medium tabular-nums text-[color:var(--accent-light)]">{fmt(eidInfo.eidPrayerDateTime, config.tz)}</p>
                    </div>
                  </div>
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
    config, now, hijriText, eidInfo, dynamicFontSize, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign,
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
              <span className="text-3xl text-[color:var(--accent2)] font-bold mt-2">{now.format("dddd, DD. MMMM")}</span>
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
                {eidInfo.active ? (
                  <motion.div key="eid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center">
                    <p className="whitespace-pre-line text-2xl font-medium text-[color:var(--accent2)] uppercase tracking-[0.25em] mb-4">{config.eidAlFitr?.title || "Eid al-Fitr"}</p>
                    <h4 className="text-2xl font-medium mb-6">
                      {eidInfo.isEidDay ? "Heute ist Eid" : `Noch ${eidInfo.daysLeft} ${eidInfo.daysLeft === 1 ? "Tag" : "Tage"} bis Bayram / Eid`}
                    </h4>
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div className="bg-[var(--surface-2)] rounded-3xl border border-[color:var(--surface-border)] p-6">
                        <p className="text-lg text-[color:var(--ink-soft)] uppercase tracking-widest mb-2">Sabah</p>
                        <p className="text-5xl font-medium tabular-nums">{fmt(eidInfo.sabahDateTime, config.tz)}</p>
                      </div>
                      <div className="bg-[var(--accent2-soft)] rounded-3xl border border-[color:var(--accent2-soft)] p-6">
                        <p className="text-lg text-[color:var(--accent2)] uppercase tracking-widest mb-2">Eid-Gebet</p>
                        <p className="text-5xl font-medium tabular-nums text-[color:var(--accent-light)]">{fmt(eidInfo.eidPrayerDateTime, config.tz)}</p>
                      </div>
                    </div>
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
function MihrabBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Zellige-/Rautenraster */}
      <svg className="absolute inset-0 h-full w-full text-[color:var(--accent)]" style={{ opacity: 0.06 }} aria-hidden="true">
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

      {/* langsam rotierendes Mandala */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ rotate: 360 }}
        transition={{ duration: 150, repeat: Infinity, ease: "linear" }}
      >
        <svg viewBox="0 0 200 200" className="text-[color:var(--accent2)]" style={{ width: "82vh", height: "82vh", opacity: 0.07 }} aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="0.8">
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="74" />
            <circle cx="100" cy="100" r="50" />
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={i} x1="100" y1="4" x2="100" y2="100" transform={`rotate(${i * 30} 100 100)`} />
            ))}
            <rect x="42" y="42" width="116" height="116" transform="rotate(0 100 100)" />
            <rect x="42" y="42" width="116" height="116" transform="rotate(45 100 100)" />
          </g>
        </svg>
      </motion.div>

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
    config, now, hijriText, eidInfo, randomAyah,
    times, upcoming, currentPrayerKey, remaining, progressPct, moonDesign,
  } = view;

  const pct = Math.min(100, Math.max(0, progressPct));

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MihrabBackground />
      <div className="relative z-10 h-full w-full p-8 grid grid-cols-12 gap-8">
        {/* LINKS: vertikale Gebetsliste */}
        <aside className={`col-span-4 rounded-[40px] ${GLASS} border-l-[color:var(--accent2)] border-l-8 p-7 flex flex-col`}>
          <div className="flex items-center gap-4 mb-5 shrink-0">
            <img src="\DITIB-Logo.svg.png" alt="Moschee Logo" className="h-12 w-auto object-contain" />
            <div className="min-w-0">
              <h1 className="text-5xl font-medium uppercase tracking-tight leading-none truncate">{config.name}</h1>
              <span className="text-2xl text-[color:var(--accent2)] font-bold">{now.format("dddd, DD. MMMM")}</span>
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
                  className={`flex-1 rounded-2xl border-2 px-5 flex items-center justify-between ${rowCls}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <motion.span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: dot }}
                      animate={active ? { scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 1 }}
                      transition={active ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span lang="tr" className="text-6xl font-medium uppercase tracking-tight leading-none truncate">{LABELS[k].tr}</span>
                      <span className={`text-3xl uppercase ${active ? "text-black/70" : "text-[color:var(--ink-soft)]"}`}>{LABELS[k].ar}</span>
                    </div>
                  </div>
                  <span className="text-7xl font-medium tabular-nums tracking-tight">{fmt(times[k], config.tz)}</span>
                </motion.div>
              );
            })}
          </div>
        </aside>

        {/* RECHTS: Uhr, Nische, Inhalts-Band */}
        <main className="col-span-8 flex flex-col gap-6 min-h-0">
          {/* Uhr + Mond */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <MoonPhase size={170} date={now.toDate()} variant={moonDesign} />
              <div className="flex flex-col">
                <span className="text-3xl uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">{getMoonPhaseName(getMoonPhase(now.toDate()))}</span>
                <span className="text-6xl font-medium text-[color:var(--accent)] leading-tight">{hijriText}</span>
              </div>
            </div>
            <div className="text-9xl font-medium tabular-nums leading-none flex items-baseline drop-shadow-[0_0_24px_var(--accent-glow)]">
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
                <h2 className="text-8xl font-medium leading-none tracking-tight">{upcoming.key ? LABELS[upcoming.key].tr : "—"}</h2>
                <p className="text-4xl text-[color:var(--accent-light)] uppercase tracking-widest mt-3">{upcoming.key ? LABELS[upcoming.key].ar : ""}</p>
                <p className="text-[9rem] font-medium tabular-nums tracking-tighter leading-none mt-6 whitespace-nowrap">{remaining}</p>
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
          <div className={`shrink-0 rounded-[30px] ${GLASS} px-8 py-5 flex items-center justify-center text-center overflow-hidden`} style={{ minHeight: "19%" }}>
            <AnimatePresence mode="wait">
              {eidInfo.active ? (
                <motion.div key="eid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
                  <span className="text-3xl font-medium text-[color:var(--accent2)] uppercase tracking-[0.25em]">{(config.eidAlFitr?.title || "Eid al-Fitr").replace(/\n/g, " · ")}</span>
                  <span className="text-3xl">Sabah <b className="tabular-nums">{fmt(eidInfo.sabahDateTime, config.tz)}</b></span>
                  <span className="text-3xl text-[color:var(--accent)]">Eid-Gebet <b className="tabular-nums">{fmt(eidInfo.eidPrayerDateTime, config.tz)}</b></span>
                </motion.div>
              ) : upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div key="ayah" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center" style={{ hyphens: "auto", wordBreak: "break-word" }}>
                  <p lang="de" className="font-medium text-[color:var(--ink)] italic leading-snug text-[2.4rem] text-center">"{randomAyah.text}"</p>
                  <p className="mt-2 text-xl text-[color:var(--accent)] font-medium uppercase tracking-widest opacity-70">{randomAyah.ref}</p>
                </motion.div>
              ) : (
                <motion.div key="iqama" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-12">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl text-[color:var(--accent2)] uppercase tracking-[0.2em]">Aktuell</span>
                    <span className="text-5xl font-medium italic">{currentPrayerKey ? (upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr) : "—"}</span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl text-[color:var(--ink-soft)] uppercase tracking-widest">Gamet / Iqama</span>
                    <span className="text-6xl font-medium tabular-nums text-[color:var(--accent)]">
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