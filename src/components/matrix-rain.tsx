import { useEffect, useRef } from "react";

const CHARS = "アイウエオカキクケコサシスセソ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// The black backdrop and the green rain are independent layers on purpose:
// on close, the backdrop fades away first while the rain keeps falling on
// top of the reappearing dashboard, and only afterwards does the rain
// itself stop and clear — rather than everything vanishing as one block.
const FADE_IN_MS = 600; // backdrop opacity ramp-in on open
const INTRO_MS = 2000; // columns start at staggered random times within this window
const SUSTAIN_MS = 6000; // full black, full rain
const BG_FADE_MS = 2000; // backdrop opacity ramp-out — rain keeps spawning through this
const RAIN_TAIL_MS = 1000; // after the backdrop is gone: spawning stops, trails clear out

const BG_FADE_START = INTRO_MS + SUSTAIN_MS;
const RAIN_STOP_AT = BG_FADE_START + BG_FADE_MS;
const AUTO_CLOSE_MS = RAIN_STOP_AT + RAIN_TAIL_MS;

export function MatrixRain({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // onClose is an inline arrow at the call site (new reference every parent
  // render). Reading it via a ref keeps this effect's deps down to [open]
  // instead of tearing down and restarting the whole animation on every
  // unrelated re-render of the dashboard (e.g. the clock ticking).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const bg = bgRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !bg || !ctx) return;

    bg.style.opacity = "0";

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const fontSize = 16;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array(columns).fill(1);
    const columnStart = Array.from({ length: columns }, () => Math.random() * INTRO_MS);

    const startedAt = Date.now();
    // A manual close (click/Escape) jumps straight to the backdrop-fade
    // point instead of waiting out the full sustain, but still runs through
    // the exact same bg-fade → rain-continues → rain-stops sequence.
    let manualCloseAt: number | null = null;
    function requestClose() {
      if (manualCloseAt === null) manualCloseAt = Date.now();
    }

    let raf: number;
    let finished = false;
    function draw() {
      if (!ctx || !canvas || !bg || finished) return;
      const realElapsed = Date.now() - startedAt;
      const elapsed =
        manualCloseAt !== null ? BG_FADE_START + (Date.now() - manualCloseAt) : realElapsed;

      let bgOpacity = 1;
      if (elapsed < FADE_IN_MS) bgOpacity = elapsed / FADE_IN_MS;
      if (elapsed >= BG_FADE_START) {
        bgOpacity = Math.max(0, 1 - (elapsed - BG_FADE_START) / BG_FADE_MS);
      }
      bg.style.opacity = String(bgOpacity);

      const stillSpawning = elapsed < RAIN_STOP_AT;

      // Fade existing glyphs toward transparency (not toward black) so the
      // canvas stays correctly composited over the independently-fading
      // backdrop, and still shows through once the backdrop is gone.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      ctx.fillStyle = "#3ef07c";
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        if (!stillSpawning || elapsed < columnStart[i]) continue;
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }

      if (elapsed >= AUTO_CLOSE_MS) {
        finished = true;
        onCloseRef.current();
        return;
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    rootRef.current?.addEventListener("click", requestClose);
    const root = rootRef.current;

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      root?.removeEventListener("click", requestClose);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] cursor-pointer">
      <div ref={bgRef} className="absolute inset-0 bg-black" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
