import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudFog,
  CloudLightning,
  Wind,
  Plus,
  X,
  Pencil,
  Check,
  ExternalLink,
  MapPin,
  Newspaper,
  CalendarDays,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Search,
  WifiOff,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheatSheet } from "@/components/cheat-sheet";
import { LoginGate } from "@/components/login-gate";
import { WorkoutTab } from "@/components/workout-tab";
import { WeatherParticles, particleModeFor } from "@/components/weather-particles";
import { ProceduralWallpaper, shouldUseLightTheme } from "@/components/procedural-wallpaper";
import { SiteNav } from "@/components/site-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalState } from "@/lib/use-local-state";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { site } from "@/site.config";

// Hidden easter eggs (triple-click/hold-key, never linked from the UI) —
// lazy-loaded so their ~1,800 lines of game logic aren't in the bundle every
// visitor downloads just to see the weather.
const WordleGame = lazy(() =>
  import("@/components/wordle-game").then((m) => ({ default: m.WordleGame })),
);
const Game2048 = lazy(() =>
  import("@/components/game-2048").then((m) => ({ default: m.Game2048 })),
);
const SnakeGame = lazy(() =>
  import("@/components/snake-game").then((m) => ({ default: m.SnakeGame })),
);
const TetrisGame = lazy(() =>
  import("@/components/tetris-game").then((m) => ({ default: m.TetrisGame })),
);
const MatrixRain = lazy(() =>
  import("@/components/matrix-rain").then((m) => ({ default: m.MatrixRain })),
);

// react-day-picker (+ its date-fns dependency) only backs this one date
// picker, and Radix's Popover.Content already unmounts its children while
// closed — so this loads on first "Vælg dato" click for free, no extra
// mount-tracking needed like the Dialog-based games above.
const Calendar = lazy(() =>
  import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })),
);

export const Route = createFileRoute("/")({
  // Personal, login-gated dashboard — unlike /cv, this shouldn't show up in
  // search results.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
    links: [{ rel: "manifest", href: "/manifest.json" }],
  }),
  component: Gate,
});

// ---------- Types ----------
type QuickLink = { id: string; name: string; url: string };
type HourlyPoint = { time: string; temp: number; code: number };
type Weather = {
  temp: number;
  code: number;
  wind: number;
  city: string;
  hi: number;
  lo: number;
  sunrise: string;
  sunset: string;
  hourly: HourlyPoint[];
};
type NewsItem = { title: string; url: string; pubDate: string };
type CalendarEvent = { title: string; start: string; end: string; allDay: boolean };
type SpotifyNowPlaying = {
  playing: boolean;
  trackId?: string;
  title?: string;
  artist?: string;
  albumArt?: string | null;
  progressMs?: number;
  durationMs?: number;
  url?: string | null;
  isSaved?: boolean;
  deviceName?: string | null;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---------- Storage ----------
const LINKS_KEY = "dash.links.v1";

const LOCATION_KEY = "dash.location.v1";

type SavedLocation = { lat: number; lon: number; city: string };

const defaultLinks: QuickLink[] = [
  { id: "1", name: "Gmail", url: "https://mail.google.com" },
  { id: "2", name: "Kalender", url: "https://calendar.google.com" },
  { id: "3", name: "GitHub", url: "https://github.com" },
  { id: "4", name: "YouTube", url: "https://youtube.com" },
  { id: "5", name: "Drev", url: "https://drive.google.com" },
  { id: "6", name: "ChatGPT", url: "https://chatgpt.com" },
];

// ---------- Helpers ----------
function greeting(h: number) {
  if (h < 5) return "Godaften";
  if (h < 11) return "Godmorgen";
  if (h < 17) return "God dag";
  return "Godaften";
}

function weatherIcon(code: number, cls = "h-10 w-10") {
  if ([0, 1].includes(code)) return <Sun className={cls} />;
  if ([2, 3].includes(code)) return <Cloud className={cls} />;
  if ([45, 48].includes(code)) return <CloudFog className={cls} />;
  if (code >= 51 && code <= 67) return <CloudRain className={cls} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={cls} />;
  if (code >= 80 && code <= 82) return <CloudRain className={cls} />;
  if (code >= 95) return <CloudLightning className={cls} />;
  return <Wind className={cls} />;
}

function weatherLabel(code: number) {
  const map: Record<number, string> = {
    0: "Klart vejr",
    1: "Næsten klart",
    2: "Delvist skyet",
    3: "Overskyet",
    45: "Tåge",
    48: "Rimtåge",
    51: "Let støvregn",
    53: "Støvregn",
    55: "Kraftig støvregn",
    61: "Let regn",
    63: "Regn",
    65: "Kraftig regn",
    71: "Let sne",
    73: "Sne",
    75: "Kraftig sne",
    80: "Byger",
    81: "Byger",
    82: "Voldsomme byger",
    95: "Tordenvejr",
    96: "Torden med hagl",
    99: "Torden med hagl",
  };
  return map[code] ?? "—";
}

function faviconCandidates(url: string) {
  try {
    const host = new URL(url).hostname;
    const parts = host.split(".");
    const root = parts.length > 2 ? parts.slice(-2).join(".") : host;
    // Google returns a generic 16px globe (HTTP 200) instead of erroring when it
    // has no favicon for a domain, so those candidates need a size check too.
    const candidates = [
      { src: `https://www.google.com/s2/favicons?domain=${host}&sz=64`, checkSize: true },
    ];
    if (root !== host) {
      candidates.push({
        src: `https://www.google.com/s2/favicons?domain=${root}&sz=64`,
        checkSize: true,
      });
    }
    candidates.push({ src: `https://${host}/favicon.ico`, checkSize: false });
    return candidates;
  } catch {
    return [];
  }
}

function localDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function freshnessColor(updatedAt: string | null, now: Date | null): string {
  if (!updatedAt || !now) return "bg-muted-foreground/30";
  const ageMin = (now.getTime() - new Date(updatedAt).getTime()) / 60000;
  if (ageMin < 5) return "bg-green-500";
  if (ageMin < 30) return "bg-amber-500";
  return "bg-muted-foreground/40";
}

function formatRelative(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "lige nu";
  if (diff < 3600) return `${Math.floor(diff / 60)} min siden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} t siden`;
  return `${Math.floor(diff / 86400)} d siden`;
}

function LinkIcon({ url, name }: { url: string; name: string }) {
  const candidates = useMemo(() => faviconCandidates(url), [url]);
  const [i, setI] = useState(0);

  if (i >= candidates.length) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-xs font-medium text-primary">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  const candidate = candidates[i];

  return (
    <img
      src={candidate.src}
      alt=""
      className="h-7 w-7 rounded"
      onError={() => setI((n) => n + 1)}
      onLoad={(e) => {
        if (candidate.checkSize && e.currentTarget.naturalWidth < 32) {
          setI((n) => n + 1);
        }
      }}
    />
  );
}

// Mounts a lazy easter-egg game the first time it's opened, then keeps it
// mounted forever after — so its chunk only loads on first use, but closing
// it later still lets its own Dialog animate shut instead of vanishing
// (which unmounting on every close, instead of just once up front, would cause).
function useLazyMounted(open: boolean) {
  const mountedRef = useRef(false);
  if (open) mountedRef.current = true;
  return mountedRef.current;
}

// ---------- Component ----------
function Dashboard({ authToken }: { authToken: string }) {
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${authToken}` }), [authToken]);

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  // navigator.onLine is undefined during SSR, so this starts false and
  // corrects itself on mount instead of guessing on the server.
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    function goOnline() {
      setIsOffline(false);
    }
    function goOffline() {
      setIsOffline(true);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const [links, setLinks] = useLocalState<QuickLink[]>(LINKS_KEY, defaultLinks);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setSearchQuery("");
  }

  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarConfigured, setCalendarConfigured] = useState(true);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [spotify, setSpotify] = useState<SpotifyNowPlaying | null>(null);
  const [spotifyConfigured, setSpotifyConfigured] = useState(true);
  const [spotifyClockTick, setSpotifyClockTick] = useState(0);
  const spotifyFetchedAtRef = useRef(0);

  // Light ("day") theme vs dark theme: driven by how bright the sky
  // actually looks right now, not just the clock — a midday storm should
  // read as dark, just like the wallpaper behind it does.
  useEffect(() => {
    if (!now) return;
    const isDay = shouldUseLightTheme(
      weather ? weather.code : null,
      now,
      weather?.sunrise ?? null,
      weather?.sunset ?? null,
    );
    document.documentElement.classList.toggle("day", isDay);
  }, [now, weather]);

  const [wordleOpen, setWordleOpen] = useState(false);
  const clockClicks = useRef({ count: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const [game2048Open, setGame2048Open] = useState(false);
  const greetingClicks = useRef({ count: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const [snakeOpen, setSnakeOpen] = useState(false);
  const dateClicks = useRef({ count: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const [matrixOpen, setMatrixOpen] = useState(false);
  const matrixHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tetrisOpen, setTetrisOpen] = useState(false);
  const tetrisHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [location, setLocation] = useLocalState<SavedLocation | null>(LOCATION_KEY, null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const wordleMounted = useLazyMounted(wordleOpen);
  const game2048Mounted = useLazyMounted(game2048Open);
  const snakeMounted = useLazyMounted(snakeOpen);
  const tetrisMounted = useLazyMounted(tetrisOpen);
  const matrixMounted = useLazyMounted(matrixOpen);

  useEffect(() => {
    let cancelled = false;
    async function loadForCoords(lat: number, lon: number, city?: string) {
      try {
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`,
        ).then((r) => r.json());
        let resolvedCity = city;
        if (!resolvedCity) {
          try {
            const rev = await fetch(
              `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=da`,
            ).then((r) => r.json());
            resolvedCity = rev?.results?.[0]?.name ?? "Din by";
          } catch {
            resolvedCity = "Din by";
          }
        }
        if (cancelled) return;

        const hourlyTimes: string[] = w.hourly.time;
        const nowMs = Date.now();
        let startIdx = hourlyTimes.findIndex((t) => new Date(t).getTime() >= nowMs);
        if (startIdx === -1) startIdx = 0;
        const hourly: HourlyPoint[] = [];
        for (let i = startIdx; i < Math.min(startIdx + 6, hourlyTimes.length); i++) {
          hourly.push({
            time: hourlyTimes[i],
            temp: Math.round(w.hourly.temperature_2m[i]),
            code: w.hourly.weather_code[i],
          });
        }

        setWeather({
          temp: Math.round(w.current.temperature_2m),
          code: w.current.weather_code,
          wind: Math.round(w.current.wind_speed_10m),
          city: resolvedCity!,
          hi: Math.round(w.daily.temperature_2m_max[0]),
          lo: Math.round(w.daily.temperature_2m_min[0]),
          sunrise: w.daily.sunrise[0],
          sunset: w.daily.sunset[0],
          hourly,
        });
        setWeatherUpdatedAt(new Date().toISOString());
      } catch {
        if (!cancelled) setWeatherErr("Kunne ikke hente vejret");
      }
    }

    // Manuelt valgt by (via "Skift by") vinder altid, ellers bruges standardbyen fra site.config.ts.
    if (location) {
      loadForCoords(location.lat, location.lon, location.city);
    } else {
      loadForCoords(site.defaultCity.lat, site.defaultCity.lon, site.defaultCity.name);
    }
    return () => {
      cancelled = true;
    };
  }, [location]);

  // News from DR via our server route
  useEffect(() => {
    const cancelled = false;
    (async () => {
      try {
        const data = await fetch("/api/public/tv2-news").then((r) => r.json());
        if (!cancelled && Array.isArray(data.items)) {
          setNews(data.items.slice(0, 8));
          setNewsUpdatedAt(new Date().toISOString());
        }
      } catch {}
    })();
  }, []);

  // Dagens (eller en valgt dags) aftaler fra Outlook via ICS-feed (hentet server-side)
  useEffect(() => {
    let cancelled = false;
    setCalendarLoading(true);
    (async () => {
      try {
        const qs = calendarDate ? `?date=${calendarDate}` : "";
        const data = await fetch(`/api/public/calendar${qs}`, { headers: authHeaders }).then((r) =>
          r.json(),
        );
        if (cancelled) return;
        if (data.error === "not_configured") setCalendarConfigured(false);
        if (Array.isArray(data.events)) setEvents(data.events);
      } catch {
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calendarDate, authHeaders]);

  // Spotify "nu afspilles", polled periodically — server-side proxy keeps
  // the client ID/secret/refresh token out of the browser entirely.
  const fetchSpotifyRef = useRef<() => void>(() => {});
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await fetch("/api/public/spotify-now-playing", { headers: authHeaders }).then(
          (r) => r.json(),
        );
        if (cancelled) return;
        if (data.error === "not_configured") setSpotifyConfigured(false);
        spotifyFetchedAtRef.current = Date.now();
        setSpotify(data);
      } catch {}
    }
    fetchSpotifyRef.current = poll;
    poll();
    const interval = setInterval(poll, 5000);
    // Background tabs get their timers throttled, so the interval above can
    // silently stall for minutes — force a fresh poll the moment the tab (or
    // window) regains focus so playback state doesn't feel stuck.
    function onVisible() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authHeaders]);

  // Tick every second while something is playing so the progress bar advances
  // smoothly between polls instead of jumping once every 15s.
  useEffect(() => {
    if (!spotify?.playing) return;
    const t = setInterval(() => setSpotifyClockTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [spotify?.playing, spotify?.trackId]);

  const spotifyDisplayProgressMs = useMemo(() => {
    if (!spotify) return 0;
    const base = spotify.progressMs ?? 0;
    if (!spotify.playing) return base;
    void spotifyClockTick;
    const elapsed = Date.now() - spotifyFetchedAtRef.current;
    return spotify.durationMs ? Math.min(spotify.durationMs, base + elapsed) : base + elapsed;
  }, [spotify, spotifyClockTick]);

  async function handleSpotifyControl(action: string, trackId?: string) {
    // Reflect play/pause and save/unsave immediately — we already know the
    // resulting state, no need to wait on a round-trip. Skip/previous change
    // which track is playing, which we can't guess, so those just trigger an
    // early refetch below instead.
    if (action === "play" || action === "pause") {
      setSpotify((prev) => (prev ? { ...prev, playing: action === "play" } : prev));
    } else if (action === "save" || action === "unsave") {
      setSpotify((prev) => (prev ? { ...prev, isSaved: action === "save" } : prev));
    }

    let failed = false;
    try {
      const res = await fetch("/api/public/spotify-control", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action, trackId }),
      }).then((r) => r.json());
      if (!res.ok) {
        failed = true;
        if (res.error === "premium_required")
          toast("Kræver Spotify Premium for at styre afspilning");
        else if (res.error === "insufficient_scope")
          toast(
            "Spotify-login mangler tilladelse til favoritter — kør /api/public/spotify-login igen",
          );
        else if (res.error === "no_active_device") toast("Ingen aktiv Spotify-enhed lige nu");
      }
    } catch {
      failed = true;
    }

    if (failed) {
      // The optimistic update above didn't actually happen — resync now
      // instead of leaving the button showing a state that never took effect.
      fetchSpotifyRef.current();
      return;
    }
    if (action === "next" || action === "previous") {
      // New track — refetch right away so the card doesn't sit on stale
      // title/art, then once more shortly after since Spotify's own player
      // state can lag a beat behind the command actually landing.
      fetchSpotifyRef.current();
      setTimeout(() => fetchSpotifyRef.current(), 600);
    } else {
      // Spotify's own state takes a moment to update after a command.
      setTimeout(() => fetchSpotifyRef.current(), 400);
    }
  }

  const timeStr = useMemo(
    () =>
      now
        ? now.toLocaleTimeString("da-DK", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "",
    [now],
  );
  const dateStr = useMemo(
    () =>
      now
        ? now.toLocaleDateString("da-DK", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
        : "",
    [now],
  );
  const dayProgressPct = useMemo(() => {
    if (!weather || !now) return 0;
    const sunrise = new Date(weather.sunrise).getTime();
    const sunset = new Date(weather.sunset).getTime();
    const pct = ((now.getTime() - sunrise) / (sunset - sunrise)) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [weather, now]);

  function handleClockClick() {
    const state = clockClicks.current;
    state.count++;
    if (state.timer) clearTimeout(state.timer);
    if (state.count >= 3) {
      setWordleOpen(true);
      state.count = 0;
      return;
    }
    state.timer = setTimeout(() => {
      state.count = 0;
    }, 600);
  }

  function handleGreetingClick() {
    const state = greetingClicks.current;
    state.count++;
    if (state.timer) clearTimeout(state.timer);
    if (state.count >= 3) {
      setGame2048Open(true);
      state.count = 0;
      return;
    }
    state.timer = setTimeout(() => {
      state.count = 0;
    }, 600);
  }

  function handleDateClick() {
    const state = dateClicks.current;
    state.count++;
    if (state.timer) clearTimeout(state.timer);
    if (state.count >= 3) {
      setSnakeOpen(true);
      state.count = 0;
      return;
    }
    state.timer = setTimeout(() => {
      state.count = 0;
    }, 600);
  }

  // Hold "m" for 2s to trigger the matrix rain easter egg. Ignored while
  // typing in a form field so adding a genvej with an "m" in it is safe.
  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "m" || isTyping(e.target) || matrixHoldTimer.current) return;
      matrixHoldTimer.current = setTimeout(() => {
        setMatrixOpen(true);
      }, 2000);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "m") return;
      if (matrixHoldTimer.current) {
        clearTimeout(matrixHoldTimer.current);
        matrixHoldTimer.current = null;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Hold "t" for 2s to trigger Tetris. Same guard as the matrix trigger.
  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "t" || isTyping(e.target) || tetrisHoldTimer.current) return;
      tetrisHoldTimer.current = setTimeout(() => {
        setTetrisOpen(true);
      }, 2000);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "t") return;
      if (tetrisHoldTimer.current) {
        clearTimeout(tetrisHoldTimer.current);
        tetrisHoldTimer.current = null;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // "?" opens the cheat sheet of hidden shortcuts. Same isTyping guard as the
  // matrix trigger so a "?" typed into a genvej name doesn't pop it open.
  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "?" || isTyping(e.target)) return;
      setCheatSheetOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleDragStart(index: number, id: string) {
    dragIndexRef.current = index;
    setDraggingId(id);
  }

  function handleDrop(index: number) {
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    const next = [...links];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    setLinks(next);
    dragIndexRef.current = null;
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const name = newName.trim();
    setLinks([...links, { id: crypto.randomUUID(), name, url }]);
    setNewName("");
    setNewUrl("");
    toast(`Genvej "${name}" tilføjet`);
  }

  function removeLink(id: string) {
    const link = links.find((l) => l.id === id);
    setLinks(links.filter((l) => l.id !== id));
    if (link) toast(`Genvej "${link.name}" fjernet`);
  }

  return (
    <div className="min-h-screen">
      {isOffline && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
          <WifiOff className="h-4 w-4" /> Offline — viser cachet indhold
        </div>
      )}
      <WorkoutTab authHeaders={authHeaders} />
      <ProceduralWallpaper
        code={weather ? weather.code : null}
        now={now}
        sunrise={weather ? weather.sunrise : null}
        sunset={weather ? weather.sunset : null}
      />
      <WeatherParticles mode={weather ? particleModeFor(weather.code) : null} />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10 md:py-16">
        <header className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p
              onClick={handleDateClick}
              title="Psst… klik 3 gange"
              className="on-wallpaper cursor-pointer select-none text-sm uppercase tracking-[0.2em] text-foreground/75"
            >
              {dateStr}
            </p>
            <h1
              onClick={handleGreetingClick}
              className="on-wallpaper mt-3 cursor-pointer select-none font-sans text-4xl font-bold tracking-tight leading-none sm:text-5xl md:text-6xl"
            >
              {now ? greeting(now.getHours()) : "Hej"},{" "}
              <span className="text-primary">{site.ownerName}</span>.
            </h1>
          </div>
          <div className="text-right">
            <div
              onClick={handleClockClick}
              title="Psst… klik 3 gange"
              className="on-wallpaper cursor-pointer select-none font-display text-5xl tabular-nums sm:text-6xl md:text-7xl"
            >
              {timeStr}
            </div>
          </div>
        </header>

        <SiteNav />

        <form
          onSubmit={handleSearch}
          className="glass mb-8 flex items-center gap-3 rounded-full px-5 py-3"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søg på Google…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </form>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
          {/* Vejr */}
          <section
            className="glass animate-card-in rounded-2xl p-6 lg:col-span-2"
            style={{ animationDelay: "0ms" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Vejret
              </h2>
              {weather && (
                <button
                  onClick={() => setShowLocationPicker((s) => !s)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition hover:surface-tint hover:text-foreground"
                  title="Skift by"
                >
                  <MapPin className="h-3 w-3" /> {weather.city}
                </button>
              )}
            </div>
            {showLocationPicker && (
              <LocationPicker
                onPick={(loc) => {
                  setLocation(loc);
                  setShowLocationPicker(false);
                }}
                onClear={() => {
                  setLocation(null);
                  setShowLocationPicker(false);
                }}
                hasSaved={!!location}
              />
            )}
            {weather ? (
              <div>
                <div className="flex items-center gap-4">
                  <div className="text-primary">{weatherIcon(weather.code, "h-14 w-14")}</div>
                  <div>
                    <div className="font-display text-5xl tabular-nums">{weather.temp}°</div>
                    <div className="text-sm text-muted-foreground">
                      {weatherLabel(weather.code)}
                    </div>
                  </div>
                </div>

                {weather.hourly.length > 0 && (
                  <div className="mt-4 flex gap-3 overflow-x-auto border-t hairline pt-4">
                    {weather.hourly.map((h, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.time).toLocaleTimeString("da-DK", { hour: "2-digit" })}
                        </span>
                        <div className="text-primary">{weatherIcon(h.code, "h-5 w-5")}</div>
                        <span className="text-xs tabular-nums">{h.temp}°</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t hairline pt-4">
                  <div className="relative h-1.5 rounded-full surface-tint">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary"
                      style={{ width: `${dayProgressPct}%` }}
                    />
                    <div
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                      style={{ left: `${dayProgressPct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {new Date(weather.sunrise).toLocaleTimeString("da-DK", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>
                      {new Date(weather.sunset).toLocaleTimeString("da-DK", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t hairline pt-4 text-sm text-muted-foreground">
                  <span>
                    Højeste <span className="text-foreground">{weather.hi}°</span>
                  </span>
                  <span>
                    Laveste <span className="text-foreground">{weather.lo}°</span>
                  </span>
                  <span>
                    Vind <span className="text-foreground">{weather.wind}</span>
                  </span>
                </div>
                {weatherUpdatedAt && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${freshnessColor(weatherUpdatedAt, now)}`}
                    />
                    Opdateret {formatRelative(weatherUpdatedAt)}
                  </div>
                )}
              </div>
            ) : weatherErr ? (
              <div className="text-sm text-muted-foreground">{weatherErr}</div>
            ) : (
              <div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-9 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between border-t hairline pt-4">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-10" />
                </div>
              </div>
            )}
          </section>

          {/* Genveje */}
          <section
            className="glass animate-card-in flex flex-col rounded-2xl p-6 lg:col-span-2"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Genveje
              </h2>
              <button
                onClick={() => setEditing((e) => !e)}
                className={
                  editing
                    ? "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:surface-tint hover:text-foreground"
                    : "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-0"
                }
              >
                {editing ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Færdig
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5" /> Rediger
                  </>
                )}
              </button>
            </div>

            {/* Centered in whatever leftover height the row gives this card,
                so a taller neighbour (e.g. Vejret) doesn't leave the icons
                stranded at the top with dead air below them. */}
            <div className="flex flex-1 flex-col justify-center">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {links.map((l, i) => (
                  <div
                    key={l.id}
                    className={`group relative ${draggingId === l.id ? "opacity-40" : ""}`}
                    draggable={editing}
                    onDragStart={() => handleDragStart(i, l.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => setDraggingId(null)}
                  >
                    <a
                      href={l.url}
                      onClick={(e) => {
                        if (editing) e.preventDefault();
                      }}
                      className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-xl hairline border surface-tint p-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:surface-tint-strong ${editing ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <LinkIcon url={l.url} name={l.name} />
                      <span className="line-clamp-1 text-center text-xs text-muted-foreground group-hover:text-foreground">
                        {l.name}
                      </span>
                    </a>
                    {editing && (
                      <button
                        onClick={() => removeLink(l.id)}
                        className="absolute -right-2.5 -top-2.5 rounded-full bg-destructive p-2.5 text-destructive-foreground shadow"
                        aria-label={`Fjern ${l.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {editing && (
                <form onSubmit={addLink} className="mt-4 flex flex-col gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Navn"
                    className="rounded-md hairline border surface-tint px-3 py-2 text-sm outline-none focus:border-primary/60"
                  />
                  <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://…"
                    className="rounded-md hairline border surface-tint px-3 py-2 text-sm outline-none focus:border-primary/60"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" /> Tilføj
                  </button>
                </form>
              )}
            </div>
          </section>

          {/* Spotify */}
          <section
            className="glass animate-card-in flex flex-col rounded-2xl p-6 lg:col-span-2"
            style={{ animationDelay: "160ms" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Music className="h-3.5 w-3.5" /> Spotify
              </h2>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              {!spotifyConfigured ? (
                <div className="text-sm text-muted-foreground">Ikke sat op endnu.</div>
              ) : spotify?.title ? (
                <div className="flex w-full flex-col items-center gap-3">
                  <a
                    href={spotify.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col items-center gap-3"
                  >
                    {spotify.albumArt && (
                      <img
                        src={spotify.albumArt}
                        alt=""
                        className="h-24 w-24 rounded-lg object-cover shadow-lg"
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-sm font-medium text-foreground group-hover:underline">
                        {spotify.title}
                      </div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {spotify.artist}
                      </div>
                      {spotify.deviceName && (
                        <div className="line-clamp-1 text-xs text-muted-foreground/70">
                          Afspiller på {spotify.deviceName}
                        </div>
                      )}
                    </div>
                  </a>
                  {!!spotify.durationMs && (
                    <div className="w-full">
                      <div className="h-1 w-full rounded-full surface-tint">
                        <div
                          className="h-1 rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                          style={{
                            width: `${Math.min(100, (spotifyDisplayProgressMs / spotify.durationMs) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>{formatDuration(spotifyDisplayProgressMs)}</span>
                        <span>{formatDuration(spotify.durationMs)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() =>
                        handleSpotifyControl(spotify.isSaved ? "unsave" : "save", spotify.trackId)
                      }
                      title={spotify.isSaved ? "Fjern fra favoritter" : "Føj til favoritter"}
                      className="rounded-md p-2.5 text-muted-foreground transition hover:surface-tint hover:text-foreground"
                    >
                      <Heart
                        className={`h-4 w-4 transition-colors ${spotify.isSaved ? "fill-primary text-primary" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => handleSpotifyControl("previous")}
                      title="Forrige"
                      className="rounded-md p-2.5 text-muted-foreground transition hover:surface-tint hover:text-foreground"
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSpotifyControl(spotify.playing ? "pause" : "play")}
                      title={spotify.playing ? "Pause" : "Afspil"}
                      className="rounded-md p-2.5 text-foreground transition hover:surface-tint"
                    >
                      {spotify.playing ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleSpotifyControl("next")}
                      title="Næste"
                      className="rounded-md p-2.5 text-muted-foreground transition hover:surface-tint hover:text-foreground"
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Ingen musik afspilles lige nu.</div>
              )}
            </div>
          </section>

          {/* Nyheder */}
          <section
            className="glass animate-card-in rounded-2xl p-6 lg:col-span-3"
            style={{ animationDelay: "240ms" }}
          >
            <div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Newspaper className="h-3.5 w-3.5" /> Seneste nyheder
              </h2>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {newsUpdatedAt && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${freshnessColor(newsUpdatedAt, now)}`}
                  />
                )}
                via DR{newsUpdatedAt ? ` · Opdateret ${formatRelative(newsUpdatedAt)}` : ""}
              </span>
            </div>
            {news.length === 0 ? (
              <div className="flex flex-col gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-2 py-2.5">
                    <Skeleton className="h-5 w-5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ol className="grid grid-cols-1 gap-x-8 gap-y-1">
                {news.map((n, i) => (
                  <li key={n.url}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:surface-tint"
                    >
                      <span className="w-6 shrink-0 pt-0.5 text-right font-display text-lg text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="flex-1">
                        <span className="line-clamp-2 text-sm text-foreground">{n.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {formatRelative(n.pubDate)}
                          <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Kalender */}
          <section
            className="glass animate-card-in rounded-2xl p-6 lg:col-span-3"
            style={{ animationDelay: "320ms" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Dagens aftaler
              </h2>
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition hover:surface-tint hover:text-foreground"
                    title="Vælg dato"
                  >
                    {calendarDate
                      ? new Date(`${calendarDate}T00:00:00`).toLocaleDateString("da-DK", {
                          day: "numeric",
                          month: "short",
                        })
                      : "I dag"}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Suspense fallback={<div className="h-72 w-64" />}>
                    <Calendar
                      mode="single"
                      selected={calendarDate ? new Date(`${calendarDate}T00:00:00`) : new Date()}
                      onSelect={(date) => {
                        if (date) setCalendarDate(localDateStr(date));
                        setShowDatePicker(false);
                      }}
                    />
                  </Suspense>
                  {calendarDate && (
                    <button
                      onClick={() => {
                        setCalendarDate(null);
                        setShowDatePicker(false);
                      }}
                      className="w-full border-t px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      Brug i dag
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            {calendarLoading ? (
              <div className="flex flex-col gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-2 py-2.5">
                    <Skeleton className="h-4 w-12 shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : !calendarConfigured ? (
              <div className="text-sm text-muted-foreground">Ingen kalender-feed sat op endnu.</div>
            ) : events.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ingen aftaler denne dag.</div>
            ) : (
              <ol className="flex flex-col gap-1">
                {events.map((e, i) => (
                  <li
                    key={`${e.title}-${e.start}-${i}`}
                    className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:surface-tint"
                  >
                    <span className="w-16 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground">
                      {e.allDay
                        ? "Hele dagen"
                        : new Date(e.start).toLocaleTimeString("da-DK", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                    </span>
                    <span className="line-clamp-2 flex-1 text-sm text-foreground">{e.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
      <Suspense fallback={null}>
        {wordleMounted && <WordleGame open={wordleOpen} onOpenChange={setWordleOpen} />}
        {game2048Mounted && (
          <Game2048 open={game2048Open} onOpenChange={setGame2048Open} authHeaders={authHeaders} />
        )}
        {snakeMounted && (
          <SnakeGame open={snakeOpen} onOpenChange={setSnakeOpen} authHeaders={authHeaders} />
        )}
        {tetrisMounted && (
          <TetrisGame open={tetrisOpen} onOpenChange={setTetrisOpen} authHeaders={authHeaders} />
        )}
        {matrixMounted && <MatrixRain open={matrixOpen} onClose={() => setMatrixOpen(false)} />}
      </Suspense>
      <CheatSheet open={cheatSheetOpen} onOpenChange={setCheatSheetOpen} />
      <Toaster position="bottom-right" />
    </div>
  );
}

function LocationPicker({
  onPick,
  onClear,
  hasSaved,
}: {
  onPick: (loc: SavedLocation) => void;
  onClear: () => void;
  hasSaved: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{
      name: string;
      country: string;
      admin1?: string;
      latitude: number;
      longitude: number;
      id: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=da&format=json`,
          { signal: ctrl.signal },
        ).then((r) => r.json());
        setResults(r?.results ?? []);
      } catch {
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="mb-4 rounded-xl hairline border surface-tint p-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Søg by, fx ${site.defaultCity.name}…`}
        className="w-full rounded-md hairline border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
      {loading && <div className="mt-2 text-xs text-muted-foreground">Søger…</div>}
      {results.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onPick({ lat: r.latitude, lon: r.longitude, city: r.name })}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:surface-tint-strong"
              >
                <span>{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[r.admin1, r.country].filter(Boolean).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasSaved && (
        <button
          onClick={onClear}
          className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Brug automatisk placering
        </button>
      )}
    </div>
  );
}

// ---------- Login gate ----------
function Gate() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  if (!authToken) return <LoginGate onUnlock={setAuthToken} />;
  return <Dashboard authToken={authToken} />;
}
