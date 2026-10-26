import { createFileRoute } from "@tanstack/react-router";

function htmlPage(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><body style="font-family:monospace;padding:2rem;background:#111;color:#eee;line-height:1.5">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/spotify-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (error) return htmlPage(`<h1>Spotify-fejl</h1><p>${error}</p>`, 400);
        if (!code) return htmlPage("<h1>Mangler 'code' parameter</h1>", 400);

        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return htmlPage("<h1>SPOTIFY_CLIENT_ID/SECRET mangler server-side</h1>", 500);
        }
        const redirectUri = `${url.origin}/api/public/spotify-callback`;

        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });

        const data = await tokenRes.json();
        if (!tokenRes.ok) {
          return htmlPage(
            `<h1>Token-udveksling fejlede</h1><pre>${JSON.stringify(data, null, 2)}</pre>`,
            500,
          );
        }

        return htmlPage(`
          <h1>Spotify forbundet!</h1>
          <p>Kopiér denne værdi ind som miljøvariablen <b>SPOTIFY_REFRESH_TOKEN</b> i Vercels projekt-indstillinger:</p>
          <textarea style="width:100%;height:6rem;background:#222;color:#3ef07c;padding:1rem;border:none;">${data.refresh_token}</textarea>
          <p>Behandl den som en adgangskode — læg den ikke i chatten eller i kode. Denne side kan roligt genbesøges senere hvis token'en nogensinde skal fornyes.</p>
        `);
      },
    },
  },
});
