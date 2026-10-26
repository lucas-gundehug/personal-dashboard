import { Redis } from "@upstash/redis";

// Shared by login-rate-limit.ts, highscore-store.ts, calc-history-store.ts,
// and the /api/public/health check — one place to resolve which env var
// naming convention a Vercel Storage integration actually injected
// (KV_REST_API_* is what Vercel's own dashboard shows when connecting
// Upstash; UPSTASH_REDIS_REST_* is Upstash's own default naming, used if
// you connect directly instead). `redis` is null when neither is set, and
// every caller falls back to an in-memory version of its own state.
const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
