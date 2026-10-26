import { redis } from "@/lib/redis";

// Same Upstash-or-in-memory pattern as login-rate-limit.ts / highscore-store.ts.
// Public (no auth) to match /calculate itself being a public page — see the
// comment on the calc-history route for the tradeoff that comes with that.
const HISTORY_KEY = "calc:history";
const MAX_HISTORY = 5;

let memoryHistory: unknown[] = [];

export async function getCalcHistory(): Promise<unknown[]> {
  if (redis) {
    return redis.lrange<unknown>(HISTORY_KEY, 0, MAX_HISTORY - 1);
  }
  return memoryHistory;
}

export async function addCalcHistoryEntry(entry: unknown): Promise<unknown[]> {
  if (redis) {
    await redis.lpush(HISTORY_KEY, entry);
    await redis.ltrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
    return getCalcHistory();
  }
  memoryHistory = [entry, ...memoryHistory].slice(0, MAX_HISTORY);
  return memoryHistory;
}
