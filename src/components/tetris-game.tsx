import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchServerHighscore, submitServerHighscore } from "@/lib/highscore-client";

const COLS = 10;
const ROWS = 20;
const CELL = 18;
const BEST_KEY = "dash.tetris.best";
const LINES_PER_LEVEL = 10;
const LINE_SCORE = [0, 100, 300, 500, 800];

type Point = { x: number; y: number };
type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

const PIECES: Record<PieceType, { size: number; cells: Point[]; color: string }> = {
  I: {
    size: 4,
    color: "#22d3ee",
    cells: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ],
  },
  O: {
    size: 2,
    color: "#facc15",
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  T: {
    size: 3,
    color: "#c084fc",
    cells: [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  S: {
    size: 3,
    color: "#4ade80",
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  Z: {
    size: 3,
    color: "#f87171",
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  J: {
    size: 3,
    color: "#60a5fa",
    cells: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  L: {
    size: 3,
    color: "#fb923c",
    cells: [
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
};
const TYPES = Object.keys(PIECES) as PieceType[];

type Board = (string | null)[][];
type Active = {
  type: PieceType;
  cells: Point[];
  size: number;
  x: number;
  y: number;
  color: string;
};

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<string | null>(COLS).fill(null));
}

function randomType(): PieceType {
  return TYPES[Math.floor(Math.random() * TYPES.length)];
}

function spawnPiece(type: PieceType): Active {
  const def = PIECES[type];
  return {
    type,
    cells: def.cells.map((c) => ({ ...c })),
    size: def.size,
    x: Math.floor((COLS - def.size) / 2),
    y: 0,
    color: def.color,
  };
}

function rotateCells(cells: Point[], size: number): Point[] {
  return cells.map(({ x, y }) => ({ x: size - 1 - y, y: x }));
}

function collides(board: Board, cells: Point[], size: number, px: number, py: number): boolean {
  for (const c of cells) {
    const bx = px + c.x;
    const by = py + c.y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  color: string,
  alpha: number,
) {
  const x = gx * CELL;
  const y = gy * CELL;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, CELL - 2, CELL - 2, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, CELL - 4, (CELL - 4) * 0.35, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function TetrisGame({
  open,
  onOpenChange,
  authHeaders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authHeaders: HeadersInit;
}) {
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [gameOver, setGameOver] = useState(false);
  const [nextType, setNextType] = useState<PieceType>("I");

  const boardRef = useRef<Board>(emptyBoard());
  const activeRef = useRef<Active>(spawnPiece("I"));
  const nextTypeRef = useRef<PieceType>("I");
  const aliveRef = useRef(true);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);
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
    submitServerHighscore("tetris", next, authHeaders);
  }

  // Adopt the server's best if it's ahead of this browser's — e.g. after
  // playing from a different device.
  useEffect(() => {
    fetchServerHighscore("tetris", authHeaders).then((serverBest) => {
      if (serverBest != null && serverBest > bestRef.current) adoptBest(serverBest);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function spawnNext() {
    const type = nextTypeRef.current;
    activeRef.current = spawnPiece(type);
    nextTypeRef.current = randomType();
    setNextType(nextTypeRef.current);
    if (
      collides(
        boardRef.current,
        activeRef.current.cells,
        activeRef.current.size,
        activeRef.current.x,
        activeRef.current.y,
      )
    ) {
      aliveRef.current = false;
      setGameOver(true);
      if (scoreRef.current > bestRef.current) updateBest(scoreRef.current);
    }
  }

  function reset() {
    boardRef.current = emptyBoard();
    nextTypeRef.current = randomType();
    aliveRef.current = true;
    scoreRef.current = 0;
    linesRef.current = 0;
    levelRef.current = 1;
    setScore(0);
    setLevel(1);
    setGameOver(false);
    spawnNext();
  }

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function lockActive() {
    const piece = activeRef.current;
    for (const c of piece.cells) {
      const by = piece.y + c.y;
      const bx = piece.x + c.x;
      if (by >= 0) boardRef.current[by][bx] = piece.color;
    }
    let cleared = 0;
    const kept = boardRef.current.filter((row) => {
      const full = row.every((cell) => cell !== null);
      if (full) cleared++;
      return !full;
    });
    if (cleared > 0) {
      boardRef.current = [
        ...Array.from({ length: cleared }, () => Array<string | null>(COLS).fill(null)),
        ...kept,
      ];
      linesRef.current += cleared;
      scoreRef.current += LINE_SCORE[cleared] * levelRef.current;
      setScore(scoreRef.current);
      const newLevel = Math.floor(linesRef.current / LINES_PER_LEVEL) + 1;
      if (newLevel !== levelRef.current) {
        levelRef.current = newLevel;
        setLevel(newLevel);
      }
    }
    spawnNext();
  }

  function tryMove(dx: number, dy: number): boolean {
    if (!aliveRef.current) return false;
    const piece = activeRef.current;
    const nx = piece.x + dx;
    const ny = piece.y + dy;
    if (collides(boardRef.current, piece.cells, piece.size, nx, ny)) return false;
    piece.x = nx;
    piece.y = ny;
    return true;
  }

  function rotate() {
    if (!aliveRef.current) return;
    const piece = activeRef.current;
    const rotated = rotateCells(piece.cells, piece.size);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(boardRef.current, rotated, piece.size, piece.x + kick, piece.y)) {
        piece.cells = rotated;
        piece.x += kick;
        return;
      }
    }
  }

  function softDrop() {
    if (!tryMove(0, 1)) {
      if (aliveRef.current) lockActive();
    }
  }

  function hardDrop() {
    if (!aliveRef.current) return;
    while (tryMove(0, 1)) {
      // fall
    }
    lockActive();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(e.key))
        e.preventDefault();
      if (e.key === "ArrowLeft") tryMove(-1, 0);
      else if (e.key === "ArrowRight") tryMove(1, 0);
      else if (e.key === "ArrowDown") softDrop();
      else if (e.key === "ArrowUp") rotate();
      else if (e.key === " ") hardDrop();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tickMs = Math.max(120, 800 - (level - 1) * 70);
    const interval = setInterval(() => {
      if (!aliveRef.current) return;
      softDrop();
    }, tickMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, level]);

  useEffect(() => {
    if (!open) return;
    let raf: number;
    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)";
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }

      const board = boardRef.current;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const color = board[r][c];
          if (color) drawBlock(ctx, c, r, color, 1);
        }
      }

      const piece = activeRef.current;
      if (aliveRef.current) {
        let ghostY = piece.y;
        while (!collides(board, piece.cells, piece.size, piece.x, ghostY + 1)) ghostY++;
        for (const cell of piece.cells) {
          const gy = ghostY + cell.y;
          if (gy >= 0) drawBlock(ctx, piece.x + cell.x, gy, piece.color, 0.18);
        }
        for (const cell of piece.cells) {
          const by = piece.y + cell.y;
          if (by >= 0) drawBlock(ctx, piece.x + cell.x, by, piece.color, 1);
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
          <DialogTitle>Tetris</DialogTitle>
          <DialogDescription>
            Piletaster til at flytte/rotere, mellemrum for at droppe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <div className="rounded-md surface-tint px-3 py-1.5 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Point</div>
              <div className="font-display text-lg tabular-nums">{score}</div>
            </div>
            <div className="rounded-md surface-tint px-3 py-1.5 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Level</div>
              <div className="font-display text-lg tabular-nums">{level}</div>
            </div>
            <div className="rounded-md surface-tint px-3 py-1.5 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Bedste</div>
              <div className="font-display text-lg tabular-nums">{best}</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-md surface-tint px-2 py-1.5">
            <div className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Næste</div>
            <div
              className="grid grid-cols-4 grid-rows-4 gap-[1px]"
              style={{ width: 32, height: 32 }}
            >
              {Array.from({ length: 16 }, (_, i) => {
                const x = i % 4;
                const y = Math.floor(i / 4);
                const def = PIECES[nextType];
                const filled = def.cells.some((c) => c.x === x && c.y === y);
                return (
                  <div
                    key={i}
                    className="rounded-[1px]"
                    style={{ background: filled ? def.color : "transparent" }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {gameOver && (
          <div className="rounded-md bg-destructive/15 px-3 py-2 text-center text-sm">
            Spillet er slut — banen er fyldt op.
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="mx-auto rounded-xl hairline border surface-tint-strong"
        />

        <div className="flex items-center justify-center gap-4">
          <div className="grid w-36 grid-cols-3 gap-2">
            <div />
            <button
              onClick={rotate}
              className="rounded-md surface-tint py-2 hover:surface-tint-strong"
            >
              ↻
            </button>
            <div />
            <button
              onClick={() => tryMove(-1, 0)}
              className="rounded-md surface-tint py-2 hover:surface-tint-strong"
            >
              ←
            </button>
            <button
              onClick={softDrop}
              className="rounded-md surface-tint py-2 hover:surface-tint-strong"
            >
              ↓
            </button>
            <button
              onClick={() => tryMove(1, 0)}
              className="rounded-md surface-tint py-2 hover:surface-tint-strong"
            >
              →
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={hardDrop}
            className="rounded-md surface-tint px-4 py-2 text-xs font-medium hover:surface-tint-strong"
          >
            ⤓ Hurtig ned
          </button>
          <button
            onClick={reset}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Nyt spil
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
