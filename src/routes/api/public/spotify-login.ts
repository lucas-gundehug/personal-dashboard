import { createFileRoute } from "@tanstack/react-router";

// One-time setup route: visit /api/public/spotify-login once, approve on
// Spotify's consent screen, and spotify-callback.ts will show you the
// refresh token to copy into Vercel's env vars. Not linked from the UI.
export const Route = createFileRoute("/api/public/spotify-login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        if (!clientId) {
          return new Response("SPOTIFY_CLIENT_ID mangler i miljøvariablerne.", { status: 500 });
        }
        const redirectUri = `${new URL(request.url).origin}/api/public/spotify-callback`;
        const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set(
          "scope",
          "user-read-currently-playing user-read-playback-state user-modify-playback-state user-library-read user-library-modify",
        );
        // Force the consent screen even if this app was already approved
        // before — otherwise Spotify silently re-grants only the scopes from
        // that earlier approval and skips the newly added ones.
        authorizeUrl.searchParams.set("show_dialog", "true");
        return Response.redirect(authorizeUrl.toString(), 302);
      },
    },
  },
});
