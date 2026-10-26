import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchServerHighscore, submitServerHighscore } from "@/lib/highscore-client";

const SIZE = 4;
const STORAGE_KEY = "dash.2048.game";
const BEST_KEY = "dash.2048.best";

const TILE_PX = 64;
const GAP_PX = 8;
const STRIDE = TILE_PX + GAP_PX;
const BOARD_PX = GAP_PX * 2 + TILE_PX * SIZE + GAP_PX * (SIZE - 1);

const SLIDE_MS = 150;
const SPAWN_DELAY_MS = 150;
const POP_MS = 200;

type Board = number[][];
type Direction = "left" | "right" | "up" | "down";
type Tile = {
  id: number;
  r: number;
  c: number;
  value: number;
  isNew?: boolean;
  isMerged?: boolean;
};

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function getEmptyCells(b: Board): [number, number][] {
  const cells: [number, number][] = [];
  b.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === 0) cells.push([r, c]);
    }),
  );
  return cells;
}

function tilesToBoard(tiles: Tile[]): Board {
  const b = emptyBoard();
  for (const t of tiles) b[t.r][t.c] = t.value;
  return b;
}

function boardToTiles(board: Board, genId: () => number): Tile[] {
  const tiles: Tile[] = [];
  board.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== 0) tiles.push({ id: genId(), r, c, value: v });
    }),
  );
  return tiles;
}

function canMove(b: Board): boolean {
  if (getEmptyCells(b).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r][c];
      if (c < SIZE - 1 && b[r][c + 1] === v) return true;
      if (r < SIZE - 1 && b[r + 1][c] === v) return true;
    }
  }
  return false;
}

// Cell order along the movement axis, front (the wall tiles slide toward) first.
function linePositions(dir: Direction, lineIndex: number): [number, number][] {
  const idx = [0, 1, 2, 3];
  if (dir === "left") return idx.map((c) => [lineIndex, c] as [number, number]);
  if (dir === "right") return idx.map((c) => [lineIndex, 3 - c] as [number, number]);
  if (dir === "up") return idx.map((r) => [r, lineIndex] as [number, number]);
  return idx.map((r) => [3 - r, lineIndex] as [number, number]);
}

// Computes where every tile slides to, which absorbed tiles disappear on
// merge, and the resulting value of the tile they merge into. Two callers
// use this: a phase-1 "slide" render (positions only, so the CSS transition
// animates it) and a phase-2 "resolve" step (drop absorbed tiles, bump
// survivors, spawn a new tile) — matching how the mobile game animates it.
function computeMove(tiles: Tile[], dir: Direction) {
  const byPos = new Map<string, Tile>();
  for (const t of tiles) byPos.set(`${t.r},${t.c}`, t);

  const slidTiles: Tile[] = [];
  const removedIds = new Set<number>();
  const newValues = new Map<number, number>();
  let gained = 0;

  for (let lineIndex = 0; lineIndex < SIZE; lineIndex++) {
    const positions = linePositions(dir, lineIndex);
    const lineTiles = positions
      .map(([r, c]) => byPos.get(`${r},${c}`))
      .filter((t): t is Tile => !!t);

    const slots: { id: number; value: number; position: [number, number]; merged: boolean }[] = [];

    for (const tile of lineTiles) {
      const last = slots[slots.length - 1];
      if (last && !last.merged && last.value === tile.value) {
        last.value *= 2;
        last.merged = true;
        gained += last.value;
        removedIds.add(tile.id);
        newValues.set(last.id, last.value);
        slidTiles.push({ ...tile, r: last.position[0], c: last.position[1] });
      } else {
        const position = positions[slots.length];
        slots.push({ id: tile.id, value: tile.value, position, merged: false });
        slidTiles.push({ ...tile, r: position[0], c: position[1] });
      }
    }
  }

  const moved = slidTiles.some((t) => {
    const orig = tiles.find((o) => o.id === t.id)!;
    return orig.r !== t.r || orig.c !== t.c;
  });

  return { slidTiles, removedIds, newValues, gained, moved };
}

function freshTiles(genId: () => number): Tile[] {
  let tiles: Tile[] = [];
  for (let i = 0; i < 2; i++) {
    const empties = getEmptyCells(tilesToBoard(tiles));
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    tiles = [...tiles, { id: genId(), r, c, value: Math.random() < 0.9 ? 2 : 4, isNew: true }];
  }
  return tiles;
}

function loadSavedGame(): { board: Board; score: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.board) && typeof parsed?.score === "number") return parsed;
    }
  } catch {}
  return { board: emptyBoard(), score: -1 }; // score -1 signals "no save" to the caller
}

const TILE_COLORS: Record<number, string> = {
  2: "bg-[#eee4da] text-[#776e65]",
  4: "bg-[#ede0c8] text-[#776e65]",
  8: "bg-[#f2b179] text-white",
  16: "bg-[#f59563] text-white",
  32: "bg-[#f67c5f] text-white",
  64: "bg-[#f65e3b] text-white",
  128: "bg-[#edcf72] text-white",
  256: "bg-[#edcc61] text-white",
  512: "bg-[#edc850] text-white",
  1024: "bg-[#edc53f] text-white",
  2048: "bg-[#edc22e] text-white",
};

export function Game2048({
  open,
  onOpenChange,
  authHeaders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authHeaders: HeadersInit;
}) {
  const idCounterRef = useRef(1);
  function genId() {
    return idCounterRef.current++;
  }

  // Loaded lazily (once, synchronously) rather than via a load effect racing
  // a save effect — see the same fix in wordle-game.tsx for why that corrupts data.
  const [tiles, setTiles] = useState<Tile[]>(() => {
    const saved = loadSavedGame();
    return saved.score === -1 ? freshTiles(genId) : boardToTiles(saved.board, genId);
  });
  const [score, setScore] = useState<number>(() => {
    const saved = loadSavedGame();
    return saved.score === -1 ? 0 : saved.score;
  });
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [dismissedWin, setDismissedWin] = useState(false);

  // Refs mirror the latest state synchronously so the keydown handler never
  // acts on a stale render-time closure (same reasoning as wordle-game.tsx).
  const tilesRef = useRef(tiles);
  const scoreRef = useRef(score);
  const bestRef = useRef(best);
  const animatingRef = useRef(false);

  function updateTiles(next: Tile[]) {
    tilesRef.current = next;
    setTiles(next);
  }
  function updateScore(next: number) {
    scoreRef.current = next;
    setScore(next);
  }
  function adoptBest(next: number) {
    bestRef.current = next;
    setBest(next);
  }
  function updateBest(next: number) {
    adoptBest(next);
    submitServerHighscore("2048", next, authHeaders);
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ board: tilesToBoard(tiles), score }));
    } catch {}
  }, [tiles, score]);

  useEffect(() => {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {}
  }, [best]);

  // Adopt the server's best if it's ahead of this browser's — e.g. after
  // playing from a different device.
  useEffect(() => {
    fetchServerHighscore("2048", authHeaders).then((serverBest) => {
      if (serverBest != null && serverBest > bestRef.current) adoptBest(serverBest);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const board = useMemo(() => tilesToBoard(tiles), [tiles]);
  const isOver = useMemo(() => !canMove(board), [board]);
  const hasWon = useMemo(() => tiles.some((t) => t.value >= 2048), [tiles]);

  function handleMove(dir: Direction) {
    if (animatingRef.current) return;
    const current = tilesRef.current;
    const { slidTiles, removedIds, newValues, gained, moved } = computeMove(current, dir);
    if (!moved) return;

    animatingRef.current = true;
    // Phase 1: slide — same tile ids/keys, only position changed, so the
    // CSS transition on top/left animates it instead of snapping.
    updateTiles(slidTiles);
    const newScore = scoreRef.current + gained;
    updateScore(newScore);
    if (newScore > bestRef.current) updateBest(newScore);

    window.setTimeout(() => {
      // Phase 2: drop absorbed tiles, bump survivors to their merged value,
      // and spawn a new tile — after the slide has visually finished.
      const survivors = slidTiles
        .filter((t) => !removedIds.has(t.id))
        .map((t) =>
          newValues.has(t.id) ? { ...t, value: newValues.get(t.id)!, isMerged: true } : t,
        );

      const empties = getEmptyCells(tilesToBoard(survivors));
      const withSpawn = [...survivors];
      if (empties.length > 0) {
        const [r, c] = empties[Math.floor(Math.random() * empties.length)];
        withSpawn.push({ id: genId(), r, c, value: Math.random() < 0.9 ? 2 : 4, isNew: true });
      }
      updateTiles(withSpawn);

      window.setTimeout(() => {
        // Clear the transient flags so a future merge/spawn of the same
        // tile id can retrigger its pop animation.
        updateTiles(tilesRef.current.map((t) => ({ ...t, isMerged: false, isNew: false })));
        animatingRef.current = false;
      }, POP_MS);
    }, SLIDE_MS);
  }

  function newGame() {
    updateTiles(freshTiles(genId));
    updateScore(0);
    setDismissedWin(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      const map: Record<string, Direction> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        handleMove(dir);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>2048</DialogTitle>
          <DialogDescription>Flyt brikkerne sammen til du når 2048.</DialogDescription>
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
            onClick={newGame}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Nyt spil
          </button>
        </div>

        {hasWon && !dismissedWin && (
          <div className="flex items-center justify-between rounded-md bg-primary/15 px-3 py-2 text-sm">
            <span>Du nåede 2048! 🎉</span>
            <button
              onClick={() => setDismissedWin(true)}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Bliv ved med at spille
            </button>
          </div>
        )}
        {isOver && (
          <div className="rounded-md bg-destructive/15 px-3 py-2 text-center text-sm">
            Spillet er slut — ingen flere træk muligt.
          </div>
        )}

        <div
          className="relative mx-auto rounded-xl hairline border surface-tint-strong"
          style={{ width: BOARD_PX, height: BOARD_PX }}
        >
          <div className="absolute inset-2 grid grid-cols-4 gap-2">
            {Array.from({ length: SIZE * SIZE }).map((_, i) => (
              <div key={i} className="h-16 w-16 rounded-md surface-tint" />
            ))}
          </div>
          {tiles.map((t) => (
            <div
              key={t.id}
              className={`absolute flex h-16 w-16 items-center justify-center rounded-md font-display font-bold transition-[top,left] duration-150 ease-out ${
                TILE_COLORS[t.value] ?? "bg-black text-white"
              } ${t.value >= 1000 ? "text-xl" : t.value >= 100 ? "text-2xl" : "text-3xl"} ${
                t.isNew ? "animate-tile-pop" : ""
              } ${t.isMerged ? "animate-tile-merge" : ""}`}
              style={{ top: GAP_PX + t.r * STRIDE, left: GAP_PX + t.c * STRIDE }}
            >
              {t.value}
            </div>
          ))}
        </div>

        <div className="mx-auto grid w-36 grid-cols-3 gap-2">
          <div />
          <button
            onClick={() => handleMove("up")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            ↑
          </button>
          <div />
          <button
            onClick={() => handleMove("left")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            ←
          </button>
          <button
            onClick={() => handleMove("down")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            ↓
          </button>
          <button
            onClick={() => handleMove("right")}
            className="rounded-md surface-tint py-2 hover:surface-tint-strong"
          >
            →
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
