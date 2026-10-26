import { createFileRoute } from "@tanstack/react-router";
import { getSpotifyAccessToken } from "@/lib/spotify";
import { isAuthedToken, tokenFromRequest } from "@/lib/auth";
import { logError } from "@/lib/log";

export const Route = createFileRoute("/api/public/spotify-now-playing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ playing: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const token = await getSpotifyAccessToken();
          if (!token) {
            return Response.json({ playing: false, error: "not_configured" });
          }

          const res = await fetch("https://api.spotify.com/v1/me/player", {
            headers: { Authorization: `Bearer ${token}` },
          });

          // 204/202: valid token, nothing currently playing.
          if (res.status === 204 || res.status === 202 || !res.ok) {
            return Response.json({ playing: false }, { headers: { "Cache-Control": "no-store" } });
          }

          const data = await res.json();
          if (!data?.item) {
            return Response.json({ playing: false }, { headers: { "Cache-Control": "no-store" } });
          }

          let isSaved = false;
          try {
            // Feb 2026 API migration: /me/tracks/contains was replaced by the
            // generic /me/library/contains, keyed by URI instead of bare ID.
            const savedRes = await fetch(
              `https://api.spotify.com/v1/me/library/contains?uris=${encodeURIComponent(`spotify:track:${data.item.id}`)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (savedRes.ok) {
              const savedArr = await savedRes.json();
              isSaved = Boolean(savedArr?.[0]);
            } else {
              const bodyText = await savedRes.text().catch(() => "");
              logError(new Error("spotify tracks/contains failed"), {
                status: savedRes.status,
                body: bodyText.slice(0, 500),
                trackId: data.item.id,
                isLocal: data.item.is_local,
              });
            }
          } catch {}

          return Response.json(
            {
              playing: Boolean(data.is_playing),
              trackId: data.item.id,
              title: data.item.name,
              artist: (data.item.artists ?? []).map((a: { name: string }) => a.name).join(", "),
              albumArt: data.item.album?.images?.[0]?.url ?? null,
              progressMs: data.progress_ms ?? 0,
              durationMs: data.item.duration_ms ?? 0,
              url: data.item.external_urls?.spotify ?? null,
              isSaved,
              deviceName: data.device?.name ?? null,
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json({ playing: false, error: "fetch_failed" });
        }
      },
    },
  },
});
