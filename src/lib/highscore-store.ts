import { redis } from "@/lib/redis";

// Same Upstash-or-in-memory pattern as login-rate-limit.ts. Game highscores
// used to live only in each browser's localStorage — this lets them follow
// you across devices once a database is connected, and just keeps working
// locally (per-instance, non-persistent) without one.
export const GAMES = ["snake", "2048", "tetris"] as const;
export type Game = (typeof GAMES)[number];

const memoryScores = new Map<Game, number>();

export async function getHighscore(game: Game): Promise<number> {
  if (redis) {
    const value = await redis.get<number>(`highscore:${game}`);
    return value ?? 0;
  }
  return memoryScores.get(game) ?? 0;
}

export async function getAllHighscores(): Promise<Record<Game, number>> {
  const scores = await Promise.all(GAMES.map((game) => getHighscore(game)));
  return Object.fromEntries(GAMES.map((game, i) => [game, scores[i]])) as Record<Game, number>;
}

// Only writes when it's an actual improvement — returns the score that ends
// up stored either way, so the caller can always trust the return value.
export async function submitHighscore(game: Game, score: number): Promise<number> {
  const current = await getHighscore(game);
  if (score <= current) return current;
  if (redis) {
    await redis.set(`highscore:${game}`, score);
  } else {
    memoryScores.set(game, score);
  }
  return score;
}
