import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchServerHighscore, submitServerHighscore } from "@/lib/highscore-client";

const GRID = 20;
const CELL = 15;
const TICK_MS = 170;
const BEST_KEY = "dash.snake.best";

type Point = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

function randomEmptyCell(snake: Point[]): Point {
  let p: Point;
  do {
    p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (snake.some((s) => s.x === p.x && s.y === p.y));
  return p;
}

function drawApple(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = "#e5484d";
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy - r * 0.1, r * 0.35, r * 0.22, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b4226";
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.2, cy - r * 1.35);
  ctx.stroke();
  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.6, cy - r * 1.1, r * 0.42, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function SnakeGame({
  open,
  onOpenChange,
  authHeaders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authHeaders: HeadersInit;
}) {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [gameOver, setGameOver] = useState(false);
  const [deathCause, setDeathCause] = useState<"wall" | "self" | null>(null);

  const snakeRef = useRef<Point[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]);
  const dirRef = useRef<Dir>("right");
  const nextDirRef = useRef<Dir>("right");
  const foodRef = useRef<Point>({ x: 5, y: 5 });
  const aliveRef = useRef(true);
  const scoreRef = useRef(0);
  const bestRef = useRef(best);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function adoptBest(next: number) {
    bestRef.current = next;
    setBest(next);
    try {
      localStorage.setItem(BEST_KEY, String(next));
    } catch {}
  }
  function updateBest(next: number) {
    adoptBest(next);
    submitServerHighscore("snake", next, authHeaders);
  }

  // Adopt the server's best if it's ahead of this browser's — e.g. after
  // playing from a different device.
  useEffect(() => {
    fetchServerHighscore("snake", authHeaders).then((serverBest) => {
      if (serverBest != null && serverBest > bestRef.current) adoptBest(serverBest);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    snakeRef.current = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    dirRef.current = "right";
    nextDirRef.current = "right";
    aliveRef.current = true;
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
    setDeathCause(null);
    foodRef.current = randomEmptyCell(snakeRef.current);
  }

  useEffect(() => {
    if (open) reset();
  }, [open]);

  function steer(dir: Dir) {
    if (OPPOSITE[dir] === dirRef.current) return;
    nextDirRef.current = dir;
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      const map: Record<string, Dir> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        steer(dir);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      if (!aliveRef.current) return;
      dirRef.current = nextDirRef.current;
      const head = snakeRef.current[0];
      const delta = DELTA[dirRef.current];
      const newHead = { x: head.x + delta.x, y: head.y + delta.y };

      const hitWall = newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID;
      const hitSelf = snakeRef.current.some((s) => s.x === newHead.x && s.y === newHead.y);
      if (hitWall || hitSelf) {
        aliveRef.current = false;
        setGameOver(true);
        setDeathCause(hitWall ? "wall" : "self");
        if (scoreRef.current > bestRef.current) updateBest(scoreRef.current);
        return;
      }

      const ateFood = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      const newSnake = [newHead, ...snakeRef.current];
      if (!ateFood) {
        newSnake.pop();
      } else {
        scoreRef.current += 10;
        setScore(scoreRef.current);
        foodRef.current = randomEmptyCell(newSnake);
      }
      snakeRef.current = newSnake;
    }, TICK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Rendering runs on its own requestAnimationFrame loop, decoupled from the
  // game-logic tick (TICK_MS) — that's what lets the food glow pulse
  // smoothly instead of stepping once per move.
  useEffect(() => {
    if (!open) return;

    let raf: number;
    function draw() {
      // Read the ref fresh every frame instead of capturing it once: right
      // when `open` first flips true, Radix's Dialog portal hasn't always
      // mounted the canvas into the DOM yet, so an early frame or two just
      // retries via rAF until the node shows up — self-healing, imperceptible.
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)";
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }

      const fx = foodRef.current.x * CELL + CELL / 2;
      const fy = foodRef.current.y * CELL + CELL / 2;
      const pulse = 1 + 0.12 * Math.sin(Date.now() / 220);
      const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, CELL * 1.1);
      glow.addColorStop(0, "rgba(242,169,59,0.35)");
      glow.addColorStop(1, "rgba(242,169,59,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy, CELL * 1.1, 0, Math.PI * 2);
      ctx.fill();
      drawApple(ctx, fx, fy, (CELL / 2 - 1.5) * pulse);

      // Snake body: a continuous rounded tube instead of separate blocks —
      // overlapping round-capped line segments hide the seams between cells.
      const snake = snakeRef.current;
      const tailColor = [124, 45, 58];
      const headColor = [242, 169, 59];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = CELL - 3;
      for (let i = snake.length - 1; i > 0; i--) {
        const t = i / Math.max(snake.length - 1, 1);
        const col = headColor.map((v, idx) => Math.round(v + (tailColor[idx] - v) * t));
        ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        const p1 = snake[i];
        const p2 = snake[i - 1];
        ctx.beginPath();
        ctx.moveTo(p1.x * CELL + CELL / 2, p1.y * CELL + CELL / 2);
        ctx.lineTo(p2.x * CELL + CELL / 2, p2.y * CELL + CELL / 2);
        ctx.stroke();
      }

      if (snake.length > 0) {
        const head = snake[0];
        const cx = head.x * CELL + CELL / 2;
        const cy = head.y * CELL + CELL / 2;
        ctx.fillStyle = `rgb(${headColor[0]},${headColor[1]},${headColor[2]})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (CELL - 3) / 2, 0, Math.PI * 2);
        ctx.fill();

        const offsets: Record<Dir, [number, number][]> = {
          right: [
            [4, -4],
            [4, 4],
          ],
          left: [
            [-4, -4],
            [-4, 4],
          ],
          up: [
            [-4, -4],
            [4, -4],
          ],
          down: [
            [-4, 4],
            [4, 4],
          ],
        };
        ctx.fillStyle = "#171522";
        for (const [ox, oy] of offsets[dirRef.current]) {
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Snake</DialogTitle>
          <DialogDescription>
            Styr med piletaster. Spis prikkerne, ram ikke dig selv.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <div className="rounded-md surface-tint px-3 py-1.5 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Point</div>
              <div className="font-display text-lg tabular-nums">{score}</div>
            </div>
            <div className="rounded-md surface-tint px-3 py-1.5 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Bedste</div>
              <div className="font-display text-lg tabular-nums">{best}</div>
            </div>
          </div>
          <button
            onClick={reset}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Nyt spil
          </button>
        </div>

        {gameOver && (
          <div className="rounded-md bg-destructive/15 px-3 py-2 text-center text-sm">
            Spillet er slut — du ramte {deathCause === "wall" ? "væggen" : "dig selv"}.
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={GRID * CELL}
          height={GRID * CELL}
          className="mx-auto rounded-xl hairline border surface-tint-strong"
        />

        <div className="mx-auto grid w-36 grid-cols-3 gap-2">
          <div />
          <button
            onClick={() => steer("up")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            ↑
          </button>
          <div />
          <button
            onClick={() => steer("left")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            ←
          </button>
          <button
            onClick={() => steer("down")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            ↓
          </button>
          <button
            onClick={() => steer("right")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
