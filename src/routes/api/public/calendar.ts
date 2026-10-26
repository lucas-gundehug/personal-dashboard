import { createFileRoute } from "@tanstack/react-router";
import ICAL from "ical.js";
import { isAuthedToken, tokenFromRequest } from "@/lib/auth";

// Feed-URL'en er hemmelig (giver skrivebeskyttet adgang til kalenderen) og
// læses derfor kun server-side fra en miljøvariabel — den må aldrig ende i
// klient-bundlen. Sæt OUTLOOK_ICS_URL lokalt i .env.local og i Vercels
// projekt-indstillinger.
//
// Bruger ical.js (ren JS, ingen Node built-ins) i stedet for node-ical, som
// kræver "node:fs" og crashede serveren i Nitro/edge-runtimet på Vercel.
type CalendarEventOut = { title: string; start: string; end: string; allDay: boolean };

export const Route = createFileRoute("/api/public/calendar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthedToken(tokenFromRequest(request)))) {
          return Response.json({ events: [], error: "unauthorized" }, { status: 401 });
        }
        const feedUrl = process.env.OUTLOOK_ICS_URL;
        if (!feedUrl) {
          return Response.json({ events: [], error: "not_configured" }, { status: 200 });
        }
        try {
          const res = await fetch(feedUrl);
          const icsText = await res.text();
          const comp = new ICAL.Component(ICAL.parse(icsText));
          const vevents = comp.getAllSubcomponents("vevent");

          // ?date=YYYY-MM-DD lader os teste en anden dag end i dag (debugging).
          const dateParam = new URL(request.url).searchParams.get("date");
          const now = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
          const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          const rangeStart = ICAL.Time.fromJSDate(dayStart, false);

          const events: CalendarEventOut[] = [];

          for (const vevent of vevents) {
            const event = new ICAL.Event(vevent);
            const allDay = event.startDate.isDate;
            const title = event.summary || "(uden titel)";

            const push = (start: Date, end: Date) => {
              if (start < dayEnd && end > dayStart) {
                events.push({ title, start: start.toISOString(), end: end.toISOString(), allDay });
              }
            };

            if (!event.isRecurring()) {
              push(event.startDate.toJSDate(), event.endDate.toJSDate());
              continue;
            }

            // Start tæt på i dag i stedet for ved event-seriens begyndelse,
            // så gamle daglige/ugentlige serier ikke kræver tusindvis af iterationer.
            const iterator = event.iterator(rangeStart);
            let next;
            let guard = 0;
            while ((next = iterator.next()) && guard < 100) {
              guard++;
              const details = event.getOccurrenceDetails(next);
              const occStart = details.startDate.toJSDate();
              if (occStart >= dayEnd) break;
              push(occStart, details.endDate.toJSDate());
            }
          }

          events.sort((a, b) => a.start.localeCompare(b.start));

          return Response.json(
            { events, source: "outlook" },
            { headers: { "Cache-Control": "private, max-age=120" } },
          );
        } catch (e) {
          return Response.json({ events: [], error: "fetch_failed" }, { status: 200 });
        }
      },
    },
  },
});
