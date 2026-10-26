import { createFileRoute } from "@tanstack/react-router";
import { getSpotifyAccessToken } from "@/lib/spotify";
import { isAuthedToken, tokenFromRequest } from "@/lib/auth";
import { logError } from "@/lib/log";

type Action = "play" | "pause" | "next" | "previous" | "save" | "unsave";

export const Route = createFileRoute("/api/public/spotify-control")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const token = await getSpotifyAccessToken();
        if (!token) return Response.json({ ok: false, error: "not_configured" });

        const body = await request
          .json()
          .catch(() => ({}) as { action?: Action; trackId?: string });
        const action = body.action;
        const trackId = body.trackId;
        const headers = { Authorization: `Bearer ${token}` };

        let res: Response;
        try {
          if (action === "play") {
            res = await fetch("https://api.spotify.com/v1/me/player/play", {
              method: "PUT",
              headers,
            });
          } else if (action === "pause") {
            res = await fetch("https://api.spotify.com/v1/me/player/pause", {
              method: "PUT",
              headers,
            });
          } else if (action === "next") {
            res = await fetch("https://api.spotify.com/v1/me/player/next", {
              method: "POST",
              headers,
            });
          } else if (action === "previous") {
            res = await fetch("https://api.spotify.com/v1/me/player/previous", {
              method: "POST",
              headers,
            });
          } else if (action === "save" && trackId) {
            // Spotify's Feb 2026 API migration replaced the track-specific
            // /me/tracks endpoint with a generic /me/library one keyed by URI.
            res = await fetch(
              `https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`,
              { method: "PUT", headers },
            );
          } else if (action === "unsave" && trackId) {
            res = await fetch(
              `https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`,
              { method: "DELETE", headers },
            );
          } else {
            return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
          }
        } catch {
          return Response.json({ ok: false, error: "request_failed" });
        }

        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          logError(new Error("spotify-control request failed"), {
            action,
            trackId,
            status: res.status,
            body: bodyText.slice(0, 500),
          });
        }

        if (res.status === 403) {
          // Playback control genuinely needs Premium. Saving/unsaving a track
          // is a library-endpoint call any account can use — a 403 there means
          // the stored refresh token predates the user-library-modify scope,
          // not that Premium is missing.
          const error =
            action === "save" || action === "unsave" ? "insufficient_scope" : "premium_required";
          return Response.json({ ok: false, error });
        }
        if (res.status === 404) return Response.json({ ok: false, error: "no_active_device" });
        if (!res.ok) return Response.json({ ok: false, error: "request_failed" });
        return Response.json({ ok: true });
      },
    },
  },
});
