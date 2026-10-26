// The access code lives only here, server-side, read from an env var — it
// never ships to the client bundle (unlike the old hardcoded ACCESS_CODE in
// routes/index.tsx, which anyone could read straight out of devtools).
// There is no built-in default: with DASHBOARD_ACCESS_CODE unset (and no
// code set at runtime) every code and every token is refused.
//
// Deliberately not a persistent cookie: the signed token this issues lives
// only in the browser tab's JS memory (see Gate/Dashboard in routes/index.tsx),
// so a page refresh always re-prompts for the code, same as before. The
// payload also carries an expiry so a token that somehow leaks (a log line,
// a copy-pasted network tab) stops working on its own instead of staying
// valid forever until the access code changes.
//
// The HMAC key mixes in AUTH_TOKEN_SECRET when it's set, rather than signing
// with the access code alone: the code is only 4 digits (10,000 values), so
// anyone who got hold of one leaked (payload, signature) pair could brute-force
// it offline in well under a second and then forge fresh, non-expiring tokens
// — silently defeating the expiry guarantee above. Falls back to the access
// code alone when unset so existing deployments keep working unchanged;
// setting AUTH_TOKEN_SECRET (e.g. `openssl rand -hex 32`) closes that gap.
// The access code stays part of the key either way, so rotating it still
// invalidates every outstanding token — a manual "sign everyone out" lever.
//
// Uses Web Crypto (crypto.subtle) instead of node:crypto — this runs in the
// same edge-like Nitro runtime that can't use Node built-ins (see
// calendar.ts / spotify.ts for the same lesson with node:fs and Buffer).
//
// DASHBOARD_ACCESS_CODE is only the initial value — the code can be changed
// at runtime (from the companion housekeeping app's Admin tab, via
// change-code.ts) without a redeploy. A changed code is stored in Redis (or
// in-memory without Redis configured) and takes priority over the env var
// whenever present.

import { redis } from "@/lib/redis";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const CODE_OVERRIDE_KEY = "dashboard:access-code-override";
let memoryCodeOverride: string | null = null;

async function getAccessCode(): Promise<string | null> {
  if (redis) {
    const stored = await redis.get<string>(CODE_OVERRIDE_KEY);
    if (stored) return stored;
  } else if (memoryCodeOverride) {
    return memoryCodeOverride;
  }
  return process.env.DASHBOARD_ACCESS_CODE || null;
}

export async function setAccessCode(newCode: string): Promise<void> {
  if (redis) await redis.set(CODE_OVERRIDE_KEY, newCode);
  else memoryCodeOverride = newCode;
}

// Test-only: the in-memory override otherwise leaks a changed code across
// test cases within the same file run (Redis is unconfigured in tests, so
// every setAccessCode call lands here).
export function __clearAccessCodeOverrideForTests(): void {
  memoryCodeOverride = null;
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getTokenKeyMaterial(code: string) {
  const secret = process.env.AUTH_TOKEN_SECRET;
  return secret ? `${secret}:${code}` : code;
}

async function hmac(value: string, code: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await getTokenKeyMaterial(code)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkAccessCode(code: string): Promise<boolean> {
  const expected = await getAccessCode();
  if (!expected) return false;
  return constantTimeEqual(code, expected);
}

// Only called after a successful checkAccessCode, so a code is configured.
export async function buildAuthToken() {
  const code = await getAccessCode();
  if (!code) throw new Error("No access code configured");
  const payload = `ok:${Date.now() + TOKEN_TTL_MS}`;
  return `${payload}.${await hmac(payload, code)}`;
}

export async function isAuthedToken(token: string | null | undefined) {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const match = payload.match(/^ok:(\d+)$/);
  if (!match) return false;
  if (Date.now() > Number(match[1])) return false;
  const code = await getAccessCode();
  if (!code) return false;
  const expected = await hmac(payload, code);
  return constantTimeEqual(sig, expected);
}

export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}
