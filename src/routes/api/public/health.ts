import { createFileRoute } from "@tanstack/react-router";
import { redis } from "@/lib/redis";
import { getSpotifyAccessToken } from "@/lib/spotify";

// Diagnostic endpoint, intentionally unauthenticated — it only ever returns
// booleans (configured/reachable), never secret values or personal data, so
// it's safe to hit from a monitor or a phone without unlocking the dashboard
// first. Useful when "Dagens aftaler" or Spotify quietly stop working: this
// tells you whether it's a missing env var or a dead/revoked credential.
type CheckResult = { configured: boolean; ok: boolean };

async function checkCalendar(): Promise<CheckResult> {
  const feedUrl = process.env.OUTLOOK_ICS_URL;
  if (!feedUrl) return { configured: false, ok: false };
  try {
    const res = await fetch(feedUrl);
    return { configured: true, ok: res.ok };
  } catch {
    return { configured: true, ok: false };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  if (!redis) return { configured: false, ok: false };
  try {
    const pong = await redis.ping();
    return { configured: true, ok: pong === "PONG" };
  } catch {
    return { configured: true, ok: false };
  }
}

async function checkSpotify(): Promise<CheckResult> {
  const configured = Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    process.env.SPOTIFY_REFRESH_TOKEN,
  );
  if (!configured) return { configured: false, ok: false };
  try {
    const token = await getSpotifyAccessToken();
    return { configured: true, ok: Boolean(token) };
  } catch {
    return { configured: true, ok: false };
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const [calendar, spotify, database] = await Promise.all([
          checkCalendar(),
          checkSpotify(),
          checkDatabase(),
        ]);
        const degraded =
          (calendar.configured && !calendar.ok) ||
          (spotify.configured && !spotify.ok) ||
          (database.configured && !database.ok);

        return Response.json(
          {
            status: degraded ? "degraded" : "ok",
            checks: {
              calendar,
              spotify,
              database,
              accessCode: { configured: Boolean(process.env.DASHBOARD_ACCESS_CODE) },
            },
          },
          { status: degraded ? 503 : 200 },
        );
      },
    },
  },
});
