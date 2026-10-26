import { useEffect, useRef } from "react";

type ProceduralWallpaperProps = {
  code: number | null;
  now: Date | null;
  sunrise: string | null;
  sunset: string | null;
};

type RGB = [number, number, number];

type Star = { x: number; y: number; radius: number; phase: number };
type CloudPuff = { dx: number; dy: number; r: number };
type Cloud = {
  x: number;
  y: number;
  scale: number;
  speed: number;
  opacity: number;
  puffs: CloudPuff[];
};

const NIGHT_TOP: RGB = [7, 11, 26];
const NIGHT_BOTTOM: RGB = [18, 22, 42];
const TWILIGHT_TOP: RGB = [45, 42, 82];
const TWILIGHT_BOTTOM: RGB = [220, 128, 96];
const DAY_TOP: RGB = [64, 138, 222];
const DAY_BOTTOM: RGB = [192, 222, 246];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function desaturate(c: RGB, amount: number): RGB {
  const grey = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return lerpColor(c, [grey, grey, grey], amount);
}

function scale(c: RGB, factor: number): RGB {
  return [c[0] * factor, c[1] * factor, c[2] * factor];
}

function toRgb(c: RGB, alpha = 1) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

type WeatherProfile = {
  cloud: number;
  darken: number;
  desat: number;
  fog: boolean;
  storm: boolean;
  tint: RGB | null;
};

// Maps an Open-Meteo weather code onto how the sky should look: cloud
// cover, how much light it steals, and any colour cast (fog haze, cold
// rain/snow tint, storm gloom).
function weatherProfile(code: number | null): WeatherProfile {
  if (code == null)
    return { cloud: 0.15, darken: 1, desat: 0, fog: false, storm: false, tint: null };
  if (code >= 95)
    return { cloud: 0.92, darken: 0.5, desat: 0.35, fog: false, storm: true, tint: [50, 25, 70] };
  if (code === 45 || code === 48)
    return { cloud: 0.5, darken: 0.88, desat: 0.45, fog: true, storm: false, tint: null };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return { cloud: 0.78, darken: 0.72, desat: 0.3, fog: false, storm: false, tint: [30, 42, 64] };
  if (code >= 71 && code <= 77)
    return {
      cloud: 0.62,
      darken: 0.97,
      desat: 0.1,
      fog: false,
      storm: false,
      tint: [206, 224, 255],
    };
  if (code === 3)
    return { cloud: 0.6, darken: 0.85, desat: 0.2, fog: false, storm: false, tint: null };
  if (code === 2)
    return { cloud: 0.32, darken: 0.94, desat: 0.1, fog: false, storm: false, tint: null };
  return { cloud: 0.1, darken: 1, desat: 0, fog: false, storm: false, tint: null };
}

// Sun elevation in roughly [-1, 1]: 1 at solar noon, 0 at sunrise/sunset,
// negative at night (clamped at -1 a bit past dusk/dawn twilight).
function sunElevation(now: Date, sunriseIso: string, sunsetIso: string) {
  const t = now.getTime();
  const sunrise = new Date(sunriseIso).getTime();
  const sunset = new Date(sunsetIso).getTime();
  const dayLen = sunset - sunrise;
  if (t >= sunrise && t <= sunset) {
    const progress = (t - sunrise) / dayLen;
    return { elevation: Math.sin(Math.PI * progress), progress, isDay: true };
  }
  const twilightMs = 60 * 60 * 1000;
  const distance = t < sunrise ? sunrise - t : t - sunset;
  const elevation = -Math.min(distance / twilightMs, 1);
  // progress across the night arc, roughly 0 (just after sunset) -> 1 (just before sunrise)
  const nightLen = 24 * 60 * 60 * 1000 - dayLen;
  const sinceSunset = t < sunrise ? t - (sunset - 24 * 60 * 60 * 1000) : t - sunset;
  const progress = Math.min(Math.max(sinceSunset / nightLen, 0), 1);
  return { elevation, progress, isDay: false };
}

// Whether the dashboard's light ("day") text/card theme is readable
// against the current sky — true daylight brightness minus however much
// the weather is currently stealing (storms, heavy overcast) from it.
// Shares its inputs with the sky render so theme and background never
// disagree about how bright it actually looks outside.
export function shouldUseLightTheme(
  code: number | null,
  now: Date | null,
  sunrise: string | null,
  sunset: string | null,
): boolean {
  let elevation = 0.55;
  if (now && sunrise && sunset) {
    elevation = sunElevation(now, sunrise, sunset).elevation;
  }
  const profile = weatherProfile(code);
  const brightness = ((elevation + 1) / 2) * profile.darken;
  return brightness > 0.5;
}

export function ProceduralWallpaper({ code, now, sunrise, sunset }: ProceduralWallpaperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ code, now, sunrise, sunset });
  stateRef.current = { code, now, sunrise, sunset };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let clouds: Cloud[] = [];

    function makeClouds(): Cloud[] {
      const count = 6;
      return Array.from({ length: count }, (_, i) => {
        const puffCount = 3 + Math.floor(Math.random() * 3);
        return {
          x: (width / count) * i + Math.random() * width * 0.2,
          y: height * (0.08 + Math.random() * 0.32),
          scale: 0.6 + Math.random() * 1,
          speed: 3 + Math.random() * 5,
          opacity: 0.5 + Math.random() * 0.4,
          puffs: Array.from({ length: puffCount }, (_, j) => ({
            dx: (j - puffCount / 2) * 38 + Math.random() * 16,
            dy: (Math.random() - 0.5) * 18,
            r: 34 + Math.random() * 26,
          })),
        };
      });
    }

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: 140 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height * 0.75,
        radius: Math.random() * 1.4 + 0.3,
        phase: Math.random() * Math.PI * 2,
      }));
      clouds = makeClouds();
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let lightningUntil = 0;
    let nextLightningCheck = 0;

    function draw(t: number) {
      const { code, now, sunrise, sunset } = stateRef.current;
      const profile = weatherProfile(code);

      let elevation = 0.55;
      let sunProgress = 0.5;
      let isDay = true;
      if (now && sunrise && sunset) {
        const r = sunElevation(now, sunrise, sunset);
        elevation = r.elevation;
        sunProgress = r.progress;
        isDay = r.isDay;
      }

      // Sky gradient: night <-> twilight <-> day, then dimmed/tinted by weather.
      let top: RGB, bottom: RGB;
      if (elevation < 0) {
        const bt = elevation + 1; // 0..1
        top = lerpColor(NIGHT_TOP, TWILIGHT_TOP, bt);
        bottom = lerpColor(NIGHT_BOTTOM, TWILIGHT_BOTTOM, bt);
      } else {
        top = lerpColor(TWILIGHT_TOP, DAY_TOP, elevation);
        bottom = lerpColor(TWILIGHT_BOTTOM, DAY_BOTTOM, elevation);
      }
      top = scale(desaturate(top, profile.desat), profile.darken);
      bottom = scale(desaturate(bottom, profile.desat), profile.darken);
      if (profile.tint) {
        top = lerpColor(top, profile.tint, 0.18);
        bottom = lerpColor(bottom, profile.tint, 0.12);
      }

      const grad = ctx!.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, toRgb(top));
      grad.addColorStop(1, toRgb(bottom));
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, width, height);

      // Stars fade in as the sky darkens past twilight.
      const starOpacity = Math.max(0, Math.min(1, -elevation * 1.6));
      if (starOpacity > 0) {
        for (const s of stars) {
          const twinkle = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(t / 900 + s.phase);
          ctx!.fillStyle = `rgba(255,255,255,${starOpacity * twinkle})`;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // Sun / moon riding an arc across the sky.
      const progress = sunProgress;
      const arcX = width * progress;
      const arcY = height * 0.82 - Math.sin(progress * Math.PI) * height * 0.55;
      const bodyVisible =
        Math.abs(elevation) > -0.35 ? 1 : Math.max(0, 1 - Math.abs(elevation + 0.35) * 2);
      if (bodyVisible > 0.01) {
        if (isDay) {
          const warmth = 1 - Math.min(elevation, 1);
          const sunColor: RGB = lerpColor([255, 236, 170], [255, 150, 90], warmth);
          const glow = ctx!.createRadialGradient(arcX, arcY, 0, arcX, arcY, 140);
          glow.addColorStop(0, toRgb(sunColor, 0.55 * bodyVisible * profile.darken));
          glow.addColorStop(1, toRgb(sunColor, 0));
          ctx!.fillStyle = glow;
          ctx!.fillRect(arcX - 140, arcY - 140, 280, 280);
          ctx!.fillStyle = toRgb(sunColor, bodyVisible);
          ctx!.beginPath();
          ctx!.arc(arcX, arcY, 26, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          const moonColor: RGB = [226, 232, 245];
          const glow = ctx!.createRadialGradient(arcX, arcY, 0, arcX, arcY, 90);
          glow.addColorStop(0, toRgb(moonColor, 0.35 * bodyVisible));
          glow.addColorStop(1, toRgb(moonColor, 0));
          ctx!.fillStyle = glow;
          ctx!.fillRect(arcX - 90, arcY - 90, 180, 180);
          ctx!.fillStyle = toRgb(moonColor, bodyVisible);
          ctx!.beginPath();
          ctx!.arc(arcX, arcY, 18, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = toRgb(scale(bottom, 0.85), bodyVisible * 0.5);
          ctx!.beginPath();
          ctx!.arc(arcX + 6, arcY - 4, 15, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // Drifting clouds; density/opacity scale with the weather profile.
      if (profile.cloud > 0.02) {
        for (const c of clouds) {
          if (!reduceMotion) {
            c.x += c.speed / 60;
            if (c.x - 160 * c.scale > width) c.x = -160 * c.scale;
          }
          const cloudColor: RGB = profile.fog
            ? [225, 228, 235]
            : lerpColor([255, 255, 255], bottom, 0.25);
          const alpha = profile.cloud * c.opacity;
          for (const p of c.puffs) {
            const cx = c.x + p.dx * c.scale;
            const cy = c.y + p.dy * c.scale;
            const r = p.r * c.scale;
            const puffGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
            puffGrad.addColorStop(0, toRgb(cloudColor, alpha));
            puffGrad.addColorStop(1, toRgb(cloudColor, 0));
            ctx!.fillStyle = puffGrad;
            ctx!.fillRect(cx - r, cy - r, r * 2, r * 2);
          }
        }
      }

      // Ground haze for fog conditions.
      if (profile.fog) {
        const hazeGrad = ctx!.createLinearGradient(0, height * 0.5, 0, height);
        hazeGrad.addColorStop(0, "rgba(225,228,235,0)");
        hazeGrad.addColorStop(1, "rgba(225,228,235,0.35)");
        ctx!.fillStyle = hazeGrad;
        ctx!.fillRect(0, height * 0.5, width, height * 0.5);
      }

      // Occasional lightning flash during storms.
      if (profile.storm && !reduceMotion) {
        if (t > nextLightningCheck) {
          nextLightningCheck = t + 2500 + Math.random() * 4500;
          if (Math.random() < 0.5) lightningUntil = t + 110 + Math.random() * 90;
        }
        if (t < lightningUntil) {
          ctx!.fillStyle = "rgba(255,255,255,0.28)";
          ctx!.fillRect(0, 0, width, height);
        }
      }

      // Soft vignette for depth.
      const vignette = ctx!.createRadialGradient(
        width / 2,
        height * 0.4,
        height * 0.2,
        width / 2,
        height * 0.4,
        height * 0.9,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx!.fillStyle = vignette;
      ctx!.fillRect(0, 0, width, height);

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    if (reduceMotion) {
      draw(0);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-1000"
    />
  );
}
