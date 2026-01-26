import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { Settings, Maximize2, MapPin, Moon, Clock, Quote } from "lucide-react";
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

const toDateWithTime = (baseDate, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return dayjs(baseDate).hour(h).minute(m).second(0).millisecond(0);
};
const fmt = (d, tz = DEFAULT_TZ) => (d ? dayjs(d).tz(tz).format("HH:mm") : "--:--");

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
    };
  });

  const [calendar, setCalendar] = useState(null);
  const [now, setNow] = useState(dayjs().tz(config.tz));
  const [randomAyah, setRandomAyah] = useState({ text: "Lade kurzen Vers...", ref: "" });
  const lastFetchRef = useRef(0);

  const today = useMemo(() => now.startOf("day"), [now]);

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
    fetch("/ditib-2026.json").then(res => res.json()).then(setCalendar).catch(console.error);
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
    const arr = PRAYER_ORDER.map(k => ({ key: k, t: dayjs(times[k]) }));
    const found = arr.find(e => e.t.isAfter(now)) || { key: null, t: null };
    if (found.key && config.iqama[found.key] === 0) fetchRandomAyah();
    return found;
  }, [times, now, config.iqama]);

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

  const glass = "bg-slate-900/60 border-white/10 backdrop-blur-3xl shadow-2xl";

  return (
    <div lang="tr" className="h-screen w-full bg-[#01040f] text-white font-sans overflow-hidden p-8 flex flex-col justify-between">
      
      {/* HEADER */}
      <header className="flex items-center justify-between h-[15%]">
        <div className="flex flex-col gap-2 max-w-[65%]">
          <h1 className="text-7xl font-black tracking-tight uppercase leading-none truncate drop-shadow-lg">
            {config.name}
          </h1>
          <div className="flex gap-6 items-center">
            <Badge variant="outline" className="text-3xl border-emerald-500/30 px-6 py-2 bg-emerald-500/5 font-bold rounded-xl text-emerald-50">
              <MapPin className="mr-3 h-8 w-8 text-emerald-400" /> 
              {config.latitude.toFixed(3)}°, {config.longitude.toFixed(3)}°
            </Badge>
            <span className="text-4xl text-slate-400 font-bold tracking-tight">
              {now.format("dddd, DD. MMMM")}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="text-[10rem] font-black tabular-nums leading-none flex items-baseline drop-shadow-2xl">
            {now.format("HH:mm")}
            <span className="text-6xl text-emerald-500 font-black ml-6 tracking-[0.3em] opacity-90">{now.format("ss")}</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="grid grid-cols-12 gap-8 h-[55%] my-4">
        <Card className={`col-span-8 rounded-[55px] ${glass} border-t-emerald-500/50 border-t-8 flex flex-col`}>
          <CardContent className="p-12 h-full flex flex-col justify-between overflow-hidden">
            <div>
              <p className="text-emerald-400 text-2xl font-black tracking-[0.3em] uppercase mb-6 flex items-center gap-4">
                <span className="w-14 h-1.5 bg-emerald-400" /> Nächstes Gebet
              </p>
              <h2 className="text-[7.5rem] font-black leading-none tracking-tighter truncate">
                {upcoming.key ? (
                  <>{LABELS[upcoming.key].tr} <span className="text-slate-600 font-thin text-6xl mx-4">/</span> <span className="text-emerald-50 text-[6.5rem]">{LABELS[upcoming.key].ar}</span></>
                ) : "—"}
              </h2>
              <p className="text-5xl font-bold text-slate-400 mt-6 tracking-tight italic">Beginn um {fmt(upcoming.t, config.tz)} Uhr</p>
            </div>

            <div className="flex justify-between items-end">
              <div className="w-[60%]">
                <p lang="de" className="text-slate-400 text-2xl font-black mb-3 uppercase tracking-widest">Verbleibend</p>
                <p className="text-[8rem] font-black tabular-nums tracking-tighter leading-none">{remaining}</p>
                <div className="h-7 w-full bg-white/5 rounded-full mt-8 overflow-hidden border border-white/10 p-1 shadow-inner">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_40px_rgba(16,185,129,0.5)]" />
                </div>
              </div>
              <div className="flex items-center gap-4 text-4xl font-black text-emerald-400 bg-white/5 px-10 py-6 rounded-[35px] border border-white/5 shadow-xl">
                <Moon className="h-10 w-10" />
                {new Intl.DateTimeFormat("de-DE-u-ca-islamic", {day: "2-digit", month: "long", year: "numeric"}).format(now.toDate())}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RECHTS: AKTUELL / ZITAT */}
        <Card className={`col-span-4 rounded-[55px] ${glass} p-12 flex flex-col justify-between border-t-blue-500/50 border-t-8 overflow-hidden h-full`}>
          <div className="h-[25%] shrink-0">
            <p className="text-blue-400 text-2xl font-black tracking-[0.3em] uppercase mb-2">Aktuell</p>
            <h3 className="text-5xl font-black leading-tight italic truncate">
              {currentPrayerKey ? (
                <>{upcoming.key === "sunrise" ? "Sabah" : LABELS[currentPrayerKey].tr} <span className="text-slate-500 text-3xl">/ {LABELS[currentPrayerKey].ar}</span></>
              ) : "—"}
            </h3>
            <p className="text-3xl font-bold text-slate-500 mt-1 tabular-nums">Seit {fmt(times[currentPrayerKey], config.tz)}</p>
          </div>

          <div className="bg-white/5 rounded-[45px] p-6 text-center border border-white/5 shadow-inner h-[72%] flex flex-col justify-center items-center overflow-hidden">
            <AnimatePresence mode="wait">
              {upcoming.key && config.iqama[upcoming.key] === 0 ? (
                <motion.div 
                  key="ayah" 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                  className="w-full flex flex-col items-center justify-center"
                  style={{ hyphens: 'auto', wordBreak: 'break-word' }}
                >
                  <Quote className="h-10 w-10 text-emerald-500 mb-4 opacity-30 shrink-0" />
                  <p 
                    lang="de"
                    className="font-medium text-slate-200 italic leading-[1.2] px-4 text-center antialiased"
                    style={{ 
                      fontSize: dynamicFontSize, // DYNAMISCHE SCHRIFTGRÖSSE
                      transition: 'font-size 0.3s ease'
                    }}
                  >
                    "{randomAyah.text}"
                  </p>
                  <p className="mt-4 text-lg text-emerald-500/70 font-black uppercase tracking-widest shrink-0 opacity-80">{randomAyah.ref}</p>
                </motion.div>
              ) : (
                <motion.div key="iqama" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
                  <Clock className="h-12 w-12 text-emerald-500 mb-4 opacity-70" />
                  <p className="text-2xl font-black text-slate-400 uppercase tracking-widest mb-2">Gamet / Iqama</p>
                  <p className="text-[7.5rem] font-black tabular-nums leading-none">
                    {upcoming.key === "sunrise" 
                      ? fmt(dayjs(times.sunrise).subtract(45, "minute"), config.tz)
                      : fmt(dayjs(times[upcoming.key]).add(config.iqama[upcoming.key], "minute"), config.tz)
                    }
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
          const isNext = upcoming.key === k;
          return (
            <motion.div key={k} className={`rounded-[45px] p-8 border-4 transition-all duration-700 flex flex-col justify-center items-center text-center ${
                active ? "bg-emerald-500 border-emerald-200 shadow-[0_0_80px_rgba(16,185,129,0.4)] scale-110 z-20 text-black" 
                : isNext ? "bg-white/15 border-white/30 z-10" : "bg-white/5 border-transparent opacity-90"
              }`}>
              <div className="flex flex-col mb-4">
                <span lang="tr" className="text-4xl font-black uppercase tracking-tighter leading-none">{LABELS[k].tr}</span>
                <span className={`text-2xl font-bold opacity-70 uppercase leading-none mt-1 ${active ? "text-black" : "text-slate-400"}`}>{LABELS[k].ar}</span>
              </div>
              <p className={`text-[5.5rem] font-black tabular-nums leading-none tracking-tighter ${active ? "text-black" : "text-white"}`}>
                {fmt(times[k], config.tz)}
              </p>
            </motion.div>
          );
        })}
      </footer>

      <div className="absolute bottom-4 right-4 opacity-0 hover:opacity-100 transition-opacity">
        <Sheet>
          <SheetTrigger asChild><Button size="icon" variant="ghost"><Settings className="h-4 w-4" /></Button></SheetTrigger>
          <SheetContent className="bg-slate-950 text-white border-white/10">
            <SheetHeader><SheetTitle>Konfiguration</SheetTitle></SheetHeader>
            <div className="mt-4"><Label>Moschee Name</Label><Input value={config.name} onChange={(e)=>setConfig({...config, name:e.target.value})} className="bg-white/5 mt-2"/></div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}