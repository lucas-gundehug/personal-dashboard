import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { LoginGate } from "@/components/login-gate";
import { SiteNav } from "@/components/site-nav";
import { WorkoutTracker } from "@/components/workout-tracker";

export const Route = createFileRoute("/workout")({
  // Personal, login-gated page — same reasoning as "/", shouldn't show up in
  // search results.
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { name: "apple-mobile-web-app-title", content: "Træning" },
    ],
    links: [{ rel: "manifest", href: "/workout-manifest.json" }],
  }),
  component: Gate,
});

function WorkoutPage({ authToken }: { authToken: string }) {
  const authHeaders = { Authorization: `Bearer ${authToken}` };

  // The dashboard toggles a "day" class on <html> for its warm daytime
  // theme; since that's a global DOM mutation, it sticks around after
  // navigating here client-side. This page always wants the dark theme
  // (:root's default), regardless of what time it is or where you came
  // from — the dashboard corrects it again on its own next mount.
  useEffect(() => {
    document.documentElement.classList.remove("day");
  }, []);

  // Same 30s-granularity clock as the dashboard header — this page has no
  // other reason to re-render that often, so there's nothing to lose by
  // matching its cadence instead of ticking every second.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  const timeStr = now
    ? now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-10 md:py-16">
        <header className="mb-4 flex items-end justify-between gap-6 sm:mb-8">
          <div>
            <p className="on-wallpaper text-sm uppercase tracking-[0.2em] text-foreground/75">
              Ugeplan
            </p>
            <h1 className="on-wallpaper mt-1 font-sans text-3xl font-bold tracking-tight leading-none sm:mt-3 sm:text-4xl md:text-5xl">
              Træning
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="on-wallpaper font-display text-3xl tabular-nums sm:text-4xl md:text-5xl">
              {timeStr}
            </div>
            <Link
              to="/workout-edit"
              title="Rediger træningsplan"
              aria-label="Rediger træningsplan"
              className="on-wallpaper text-foreground/60 transition hover:text-foreground"
            >
              <Settings2 className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {/* Hidden on phone so the whole card fits without scrolling —
            still reachable via the edge tab / browser back, so nothing here
            is actually unreachable, just not worth the vertical space. */}
        <div className="hidden sm:block">
          <SiteNav />
        </div>

        <WorkoutTracker authHeaders={authHeaders} />
      </div>
    </div>
  );
}

function Gate() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  if (!authToken) return <LoginGate onUnlock={setAuthToken} />;
  return <WorkoutPage authToken={authToken} />;
}
