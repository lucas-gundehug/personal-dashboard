import { useEffect, useRef } from "react";

export type ParticleMode = "rain" | "snow" | null;

export function particleModeFor(code: number): ParticleMode {
  if (code >= 71 && code <= 77) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return null;
}

type Particle = { x: number; y: number; speed: number; len: number; radius: number; drift: number };

export function WeatherParticles({ mode }: { mode: ParticleMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!mode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const count = mode === "rain" ? 140 : 90;
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: mode === "rain" ? 9 + Math.random() * 7 : 1 + Math.random() * 1.8,
      len: mode === "rain" ? 10 + Math.random() * 12 : 0,
      radius: mode === "snow" ? 1 + Math.random() * 2.3 : 0,
      drift: mode === "snow" ? (Math.random() - 0.5) * 0.6 : 0,
    }));

    let raf: number;
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        if (mode === "rain") {
          ctx.strokeStyle = "rgba(180,200,255,0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x, p.y + p.len);
          ctx.stroke();
          p.y += p.speed;
          if (p.y > canvas.height) {
            p.y = -p.len;
            p.x = Math.random() * canvas.width;
          }
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.65)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          p.y += p.speed;
          p.x += p.drift;
          if (p.y > canvas.height) {
            p.y = -5;
            p.x = Math.random() * canvas.width;
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  if (!mode) return null;
  return (
    <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />
  );
}
