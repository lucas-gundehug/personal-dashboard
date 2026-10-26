import { createFileRoute } from "@tanstack/react-router";

// TV 2 lukkede deres offentlige RSS-feed. Vi henter i stedet DR Nyheder,
// som stadig udgiver et frit dansk nyhedsfeed. Ruten hedder fortsat
// /api/public/tv2-news af hensyn til eksisterende klienter.
export const Route = createFileRoute("/api/public/tv2-news")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch("https://www.dr.dk/nyheder/service/feeds/allenyheder", {
            headers: { "User-Agent": "Mozilla/5.0 DashboardBot" },
          });
          const xml = await res.text();
          const items: { title: string; url: string; pubDate: string }[] = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let m: RegExpExecArray | null;
          while ((m = itemRegex.exec(xml)) && items.length < 12) {
            const block = m[1];
            const title = extract(block, "title");
            const link = extract(block, "link");
            const pubDate = extract(block, "pubDate");
            if (title && link) items.push({ title, url: link, pubDate });
          }
          return Response.json(
            { items, source: "dr" },
            { headers: { "Cache-Control": "public, max-age=300" } },
          );
        } catch (e) {
          return Response.json({ items: [], error: "fetch_failed" }, { status: 200 });
        }
      },
    },
  },
});

function extract(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  let v = m[1].trim();
  const cdata = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdata) v = cdata[1].trim();
  return v;
}
