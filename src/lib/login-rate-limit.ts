import { redis } from "@/lib/redis";

// Brute-force deterrent for the 4-digit access code. Backed by Upstash Redis
// when it's configured — that makes the lockout real across Vercel's
// multiple serverless instances, instead of the previous in-memory Map,
// which only ever protected a single warm instance and reset on every cold
// start. Falls back to that in-memory version when no database is
// configured (e.g. local dev), so this still works without one.
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 10 * 60;

const memoryAttempts = new Map<string, { count: number; lockedUntil: number }>();

export async function isLockedOut(key: string): Promise<boolean> {
  if (redis) {
    const lockedUntil = await redis.get<number>(`login:lock:${key}`);
    return typeof lockedUntil === "number" && lockedUntil > Date.now();
  }
  const entry = memoryAttempts.get(key);
  return entry != null && entry.lockedUntil > Date.now();
}

export async function recordFailedAttempt(key: string): Promise<void> {
  if (redis) {
    const attemptsKey = `login:attempts:${key}`;
    const count = await redis.incr(attemptsKey);
    if (count === 1) await redis.expire(attemptsKey, LOCKOUT_SECONDS);
    if (count >= MAX_ATTEMPTS) {
      await redis.set(`login:lock:${key}`, Date.now() + LOCKOUT_SECONDS * 1000, {
        ex: LOCKOUT_SECONDS,
      });
      await redis.del(attemptsKey);
    }
    return;
  }
  const entry = memoryAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
    entry.count = 0;
  }
  memoryAttempts.set(key, entry);
}

export async function clearAttempts(key: string): Promise<void> {
  if (redis) {
    await Promise.all([redis.del(`login:attempts:${key}`), redis.del(`login:lock:${key}`)]);
    return;
  }
  memoryAttempts.delete(key);
}

export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
