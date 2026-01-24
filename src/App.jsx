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
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Maximize2, Volume2, VolumeX, MapPin, Sun, Moon, Clock, Compass, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

// ===== Day.js setup
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(duration);
dayjs.extend(isSameOrBefore);

dayjs.locale("de");

// ===== Constants
const DEFAULT_TZ = "Europe/Berlin";
const PRAYER_ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const LABELS = {
  fajr: "Imsak / Imsaq",
  sunrise: "Güneş / Fajr",
  dhuhr: "Öğle / Dhuhr",
  asr: "İkindi / Asr",
  maghrib: "Akşam / Maghrib",
  isha: "Yatsı / Isha",
};

// ===== Optional: Manuelle DITIB-Overrides (YYYY-MM-DD → HH:mm)
const DITIB_OVERRIDES = {
  // "2025-10-17": { fajr: "06:01", sunrise: "07:35", dhuhr: "12:56", asr: "16:00", maghrib: "18:14", isha: "19:42" },
};

// ===== Helpers
function toDateWithTime(baseDate, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return dayjs(baseDate).hour(h).minute(m).second(0).millisecond(0);
}
function fmt(d, tz = DEFAULT_TZ) {
  if (!d) return "--:--";
  return dayjs(d).tz(tz).format("HH:mm");
}
function islamicDateString(d, locale = "de-DE") {
  try {
    return new Intl.DateTimeFormat(locale + "-u-ca-islamic", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}
function getAdhanTimes({ latitude, longitude, date }) {
  const coordinates = new adhan.Coordinates(latitude, longitude);
  const params = adhan.CalculationMethod.Turkey();
  params.madhab = adhan.Madhab.Shafi;
  params.rounding = adhan.Rounding.Nearest;
  params.shafaq = adhan.Shafaq.General;
  const pt = new adhan.PrayerTimes(coordinates, date.toDate(), params);
  return {
    fajr: pt.fajr,
    sunrise: pt.sunrise,
    dhuhr: pt.dhuhr,
    asr: pt.asr,
    maghrib: pt.maghrib,
    isha: pt.isha,
  };
}
function applyOverrides(date, base) {
  const key = date.format("YYYY-MM-DD");
  const o = DITIB_OVERRIDES[key];
  if (!o) return base;
  const withO = { ...base };
  PRAYER_ORDER.forEach((k) => {
    if (o[k]) withO[k] = toDateWithTime(date, o[k]).toDate();
  });
  return withO;
}
function nextPrayer(times, now) {
  const arr = PRAYER_ORDER.map((k) => ({ key: k, t: dayjs(times[k]) }));
  const upcoming = arr.find((e) => e.t.isAfter(now));
  return upcoming || { key: null, t: null };
}
function useInterval(cb, ms) {
  useEffect(() => {
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }, [cb, ms]);
}

function getCalendarTimesForDay(today, calendar) {
  if (!calendar) return null;
  const key = today.format("YYYY-MM-DD");
  const row = calendar[key];
  if (!row) return null;

  const out = {};
  PRAYER_ORDER.forEach((k) => {
    if (row[k]) out[k] = toDateWithTime(today, row[k]).toDate();
  });

  // muss alle 6 enthalten
  if (!PRAYER_ORDER.every((k) => out[k])) return null;
  return out;
}


// ===== Main Component
export default function PrayerTVBeautiful() {
  const [config, setConfig] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("prayer_tv_config") : null;
    return saved
      ? JSON.parse(saved)
      : {
          name: "DITIB Yavuz Sultan Selim Moschee",
          latitude: 48.6215,
          longitude: 9.8294,
          tz: DEFAULT_TZ,
          audioUrl: "",
          offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
          iqama: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
        };
  });

  const [calendar, setCalendar] = useState(null);
  const [calendarError, setCalendarError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setCalendarError("");
        const res = await fetch("/ditib-2026.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCalendar(data);
      } catch (e) {
        if (!cancelled) setCalendarError(String(e?.message || e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);



  const [now, setNow] = useState(dayjs().tz(config.tz));
  const today = useMemo(() => now.startOf("day"), [now]);

  // Optional: Fallback falls Kalender fehlt (sollte bei dir selten passieren)
  const rawTimes = useMemo(
    () => getAdhanTimes({ latitude: config.latitude, longitude: config.longitude, date: today }),
    [config.latitude, config.longitude, today]
  );

  const times = useMemo(() => {
    // 1) Kalender bevorzugen
    const cal = getCalendarTimesForDay(today, calendar);

    // 2) fallback: adhan (falls kalender nicht geladen / kein datum)
    const base = cal || applyOverrides(today, rawTimes);

    // 3) Offsets anwenden (für lokale Vorstandsbeschlüsse)
    const shifted = { ...base };
    PRAYER_ORDER.forEach((k) => {
      shifted[k] = dayjs(base[k]).add(config.offsets[k] || 0, "minute").toDate();
    });

    return shifted;
  }, [today, calendar, rawTimes, config.offsets]);

  useInterval(() => setNow(dayjs().tz(config.tz)), 1000);

  useEffect(() => {
    localStorage.setItem("prayer_tv_config", JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const n = dayjs().tz(config.tz);
    const nextMidnight = n.add(1, "day").startOf("day");
    const ms = nextMidnight.diff(n);
    const id = setTimeout(() => setNow(dayjs().tz(config.tz)), ms);
    return () => clearTimeout(id);
  }, [config.tz]);

  const upcoming = useMemo(() => nextPrayer(times, now), [times, now]);

  const remaining = useMemo(() => {
    if (!upcoming.t) return null;
    const diff = upcoming.t.diff(now);
    const dur = dayjs.duration(diff);
    const hh = String(Math.floor(dur.asHours())).padStart(2, "0");
    const mm = String(dur.minutes()).padStart(2, "0");
    const ss = String(dur.seconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }, [upcoming, now]);

  const totalSpanMs = useMemo(() => {
    const idx = PRAYER_ORDER.indexOf(upcoming.key);
    const prevKey = idx > 0 ? PRAYER_ORDER[idx - 1] : null;
    const start = prevKey ? dayjs(times[prevKey]) : now.startOf("day");
    const end = upcoming && upcoming.t ? upcoming.t : now.endOf("day");
    return Math.max(1, end.diff(start));
  }, [upcoming, times, now]);

  const progressPct = useMemo(() => {
    const idx = PRAYER_ORDER.indexOf(upcoming.key);
    const prevKey = idx > 0 ? PRAYER_ORDER[idx - 1] : null;
    const start = prevKey ? dayjs(times[prevKey]) : now.startOf("day");
    const done = Math.max(0, now.diff(start));
    return Math.min(100, Math.max(0, (done / totalSpanMs) * 100));
  }, [upcoming, times, now, totalSpanMs]);

  const isCurrent = (key) => {
    const idx = PRAYER_ORDER.indexOf(key);
    const t = dayjs(times[key]);
    const nextKey = PRAYER_ORDER[idx + 1];
    const tn = nextKey ? dayjs(times[nextKey]) : null;
    return t.isSameOrBefore(now) && (!tn || now.isBefore(tn));
  };

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const [audioOn, setAudioOn] = useState(false);
  const audioRef = useRef(null);
  useEffect(() => {
    if (!audioOn || !config.audioUrl) return;
    const timers = [];
    PRAYER_ORDER.forEach((k) => {
      if (k === "sunrise") return;
      const ms = dayjs(times[k]).diff(now);
      if (ms > 0) {
        const id = window.setTimeout(() => {
          audioRef.current?.play?.().catch(() => {});
        }, ms);
        timers.push(id);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [times, audioOn, config.audioUrl, now]);

  const todayHijri = islamicDateString(now.toDate());

  // ---- shared styles (macht’s konsistenter)
  const glass =
    "bg-white/5 border-white/10 backdrop-blur-xl shadow-[0_20px_80px_-40px_rgba(0,0,0,0.8)]";
  const cardPad = "p-8 md:p-10"; // mehr Platz für große Zahlen

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(1100px_600px_at_50%_-10%,rgba(34,197,94,0.16),transparent),radial-gradient(1100px_600px_at_50%_110%,rgba(59,130,246,0.14),transparent)]" />

      {/* Background Image Layer
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 scale-105 saturate-75 hue-rotate-10"
        style={{
          backgroundImage: "url('/mosque-bg.webp')",
        }}
      />*/}

      {/* Color Accent Gradient 
      <div className="absolute inset-0 bg-[radial-gradient(1100px_600px_at_50%_-10%,rgba(34,197,94,0.16),transparent),radial-gradient(1100px_600px_at_50%_110%,rgba(59,130,246,0.14),transparent)]" />
      
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-overlay"
        style={{
          backgroundImage:
            "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.35%22/%3E%3C/svg%3E')",
        }}
      />*/}

      {/* Centered container */}
      <div className="relative mx-auto w-full max-w-[1500px] px-6 lg:px-10 py-8 select-none">
        {/* Header */}
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="text-center xl:text-left">
            <motion.h1 layout className="text-4xl md:text-5xl xl:text-6xl font-extrabold tracking-tight">
              {config.name}
            </motion.h1>

            <div className="mt-3 flex flex-wrap items-center justify-center xl:justify-start gap-2 text-slate-300">
              <Badge variant="secondary" className="bg-white/10 border-white/10 px-3 py-1 text-base">
                <MapPin className="mr-1 h-4 w-4" /> {config.latitude.toFixed(4)}, {config.longitude.toFixed(4)}
              </Badge>
              <Badge variant="secondary" className="bg-white/10 border-white/10 px-3 py-1 text-base">
                <Compass className="mr-1 h-4 w-4" /> {config.tz}
              </Badge>
            </div>

            <div className="mt-3 text-xl md:text-2xl text-slate-300">
              {now.tz(config.tz).format("dddd, DD.MM.YYYY")} · Berechnung: Diyanet/Türkiye
            </div>
          </div>

          <div className="flex flex-col items-center xl:items-end gap-3">
            <div className="text-center xl:text-right">
              <div className="text-6xl md:text-7xl xl:text-8xl font-black tabular-nums leading-none">
                {now.tz(config.tz).format("HH:mm:ss")}
              </div>
              <div className="text-slate-400 mt-2 flex items-center justify-center xl:justify-end gap-2 text-base">
                <Clock className="h-4 w-4" /> Aktuelle Uhrzeit
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={toggleFullscreen}
                className="bg-white/10 hover:bg-white/20 border-white/10 h-11 px-4 text-base rounded-2xl"
              >
                <Maximize2 className="h-4 w-4 mr-2" /> Vollbild
              </Button>

              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="secondary"
                    className="bg-white/10 hover:bg-white/20 border-white/10 h-11 px-4 text-base rounded-2xl"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Einstellungen
                  </Button>
                </SheetTrigger>

                <SheetContent className="bg-slate-950 border-white/10 text-white">
                  <SheetHeader>
                    <SheetTitle>Anzeige & Berechnung</SheetTitle>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    <Tabs defaultValue="allg">
                      <TabsList className="bg-white/10 border-white/10">
                        <TabsTrigger value="allg">Allgemein</TabsTrigger>
                        <TabsTrigger value="offsets">Offsets</TabsTrigger>
                        <TabsTrigger value="iqama">Iqama</TabsTrigger>
                        <TabsTrigger value="audio">Audio</TabsTrigger>
                      </TabsList>

                      <TabsContent value="allg" className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Moschee-Name</Label>
                            <Input value={config.name} onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Zeitzone</Label>
                            <Input value={config.tz} onChange={(e) => setConfig((c) => ({ ...c, tz: e.target.value }))} />
                          </div>
                          <div>
                            <Label>Breite (lat)</Label>
                            <Input
                              type="number"
                              value={config.latitude}
                              onChange={(e) => setConfig((c) => ({ ...c, latitude: parseFloat(e.target.value || "0") }))}
                            />
                          </div>
                          <div>
                            <Label>Länge (lng)</Label>
                            <Input
                              type="number"
                              value={config.longitude}
                              onChange={(e) => setConfig((c) => ({ ...c, longitude: parseFloat(e.target.value || "0") }))}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pt-2 text-sm text-slate-400">
                          <RefreshCw className="h-4 w-4" /> Aktualisierung täglich um 00:00 Uhr
                        </div>
                      </TabsContent>

                      <TabsContent value="offsets" className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {PRAYER_ORDER.map((k) => (
                            <div key={k}>
                              <Label>{LABELS[k]} Offset (min)</Label>
                              <Input
                                type="number"
                                value={config.offsets[k] || 0}
                                onChange={(e) =>
                                  setConfig((c) => ({ ...c, offsets: { ...c.offsets, [k]: parseInt(e.target.value || "0", 10) } }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-sm text-slate-400">
                          Hier kannst du lokale Vorstandsbeschlüsse (z.B. +2 min Maghrib) berücksichtigen.
                        </p>
                      </TabsContent>

                      <TabsContent value="iqama" className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {["fajr", "dhuhr", "asr", "maghrib", "isha"].map((k) => (
                            <div key={k}>
                              <Label>Iqama {LABELS[k]} (+min)</Label>
                              <Input
                                type="number"
                                value={config.iqama[k] || 0}
                                onChange={(e) =>
                                  setConfig((c) => ({ ...c, iqama: { ...c.iqama, [k]: parseInt(e.target.value || "0", 10) } }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-sm text-slate-400">
                          Optional: Anzeige der Iqama (Gebetsbeginn in der Moschee) relativ zum Adhan.
                        </p>
                      </TabsContent>

                      <TabsContent value="audio" className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Adhan-Audio URL (MP3)</Label>
                            <Input
                              placeholder="https://…/adhan.mp3"
                              value={config.audioUrl}
                              onChange={(e) => setConfig((c) => ({ ...c, audioUrl: e.target.value }))}
                            />
                          </div>
                          <div className="flex items-center gap-3 pt-6">
                            <Switch checked={audioOn} onCheckedChange={setAudioOn} />
                            <span className="text-sm text-slate-300 flex items-center gap-2">
                              {audioOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Adhan automatisch abspielen
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400">
                          Hinweis: Browser erfordern ggf. einen ersten Benutzer-Klick, bevor Audio automatisch abgespielt werden darf.
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* HERO / Next Prayer */}
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className={`xl:col-span-2 overflow-hidden rounded-[28px] ${glass}`}>
            <CardContent className={`${cardPad} min-h-[320px] flex items-center`}>
              {upcoming.key ? (
                <div className="w-full flex flex-col gap-8">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                    <div className="text-center md:text-left">
                      <div className="text-slate-300 flex items-center justify-center md:justify-start gap-2 text-lg">
                        <Sun className="h-5 w-5" /> Nächstes Gebet
                      </div>

                      <div className="mt-3 text-5xl md:text-6xl xl:text-7xl font-extrabold tracking-tight">
                        {LABELS[upcoming.key]}
                      </div>

                      <div className="mt-3 flex flex-wrap items-baseline justify-center md:justify-start gap-x-4 gap-y-1">
                        <div className="text-4xl md:text-5xl xl:text-6xl text-slate-200 tabular-nums font-extrabold">
                          {fmt(upcoming.t, config.tz)}
                        </div>
                        <div className="text-2xl md:text-3xl xl:text-4xl text-slate-400 tabular-nums">
                          {remaining ? `(${remaining})` : ""}
                        </div>
                      </div>

                      {config.iqama[upcoming.key] ? (
                        <div className="mt-3 text-slate-400 text-xl">
                          Iqama:{" "}
                          <span className="text-slate-200 font-semibold">
                            {fmt(dayjs(times[k]).add(config.iqama[k] || 0, "minute"), config.tz)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <Badge className="mx-auto md:mx-0 bg-white/10 border border-white/10 text-slate-200 px-4 py-2 text-lg rounded-2xl">
                      {now.tz(config.tz).format("DD.MM.YYYY")}
                    </Badge>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-slate-300 text-lg">
                      <span>Fortschritt bis zum nächsten Gebet</span>
                      <span className="tabular-nums">{Math.round(progressPct)}%</span>
                    </div>
                    <Progress value={progressPct} className="mt-3 h-3 bg-white/10" />
                    {todayHijri ? (
                      <div className="mt-4 text-slate-300 text-3xl flex items-center gap-2">
                        <Moon className="h-6 w-6" />
                        <span>{todayHijri}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="w-full text-center text-3xl py-10">Alle heutigen Gebete sind vorbei.</div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className={`rounded-[28px] ${glass}`}>
            <CardContent className={`${cardPad} min-h-[320px]`}>
              <div className="text-slate-300 text-lg mb-5 text-center xl:text-left">Heute</div>

              {(() => {
                const idx = upcoming.key ? PRAYER_ORDER.indexOf(upcoming.key) : -1;
                const nextKey = upcoming.key;
                const afterKey = idx >= 0 && idx + 1 < PRAYER_ORDER.length ? PRAYER_ORDER[idx + 1] : null;

                const Item = ({ title, k, tone }) => (
                  <div className={`rounded-[22px] p-6 border ${tone}`}>
                    <div className="text-slate-300 text-lg">{title}</div>
                    <div className="mt-1 text-3xl font-bold">{k ? LABELS[k] : "—"}</div>
                    <div className="mt-2 text-3xl text-slate-200 tabular-nums font-extrabold">{k ? fmt(times[k], config.tz) : "--:--"}</div>
                  </div>
                );

                return (
                  <div className="space-y-4">
                    <Item
                      title="Jetzt"
                      k={PRAYER_ORDER.find((k) => isCurrent(k))}
                      tone="border-emerald-400/30 bg-emerald-500/10"
                    />
                    <Item title="Als nächstes" k={nextKey} tone="border-amber-400/30 bg-amber-500/10" />
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Prayer Grid (größer + weniger schmal) */}
        <div className="mt-7 grid grid-cols-2 lg:grid-cols-3 gap-5">
          {PRAYER_ORDER.map((k) => {
            const active = isCurrent(k);
            const isNext = upcoming.key === k;

            return (
              <motion.div key={k} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card
                  className={`rounded-[26px] ${glass} ${
                    active ? "border-emerald-400/40 bg-emerald-500/10" : isNext ? "border-amber-400/40 bg-amber-500/10" : ""
                  }`}
                >
                  <CardContent className="p-7 md:p-9">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-slate-300 text-xl font-semibold">{LABELS[k]}</div>
                      <Badge
                        variant={active ? "default" : "secondary"}
                        className={`${active ? "bg-emerald-500 text-black" : "bg-white/10"} rounded-xl px-3 py-1 text-sm`}
                      >
                        {active ? "läuft" : isNext ? "als nächstes" : ""}
                      </Badge>
                    </div>

                    <div className="text-5xl md:text-6xl xl:text-7xl font-extrabold tabular-nums tracking-tight leading-none">
                      {fmt(times[k], config.tz)}
                    </div>

                    {k !== "sunrise" && config.iqama[k] ? (
                      <div className="text-slate-400 text-base mt-3">
                        Iqama: {fmt(dayjs(times[k]).add(config.iqama[k] || 0, "minute"), config.tz)}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-base mt-3 opacity-60">&nbsp;</div> // hält die Höhe stabil
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-10 text-slate-400 text-center text-sm">
        </div>
      </div>

      <audio ref={audioRef} src={config.audioUrl || undefined} preload="auto" />
    </div>
  );
}
