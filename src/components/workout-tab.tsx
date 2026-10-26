import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Footprints } from "lucide-react";
import { fetchWeekView } from "@/lib/workout-client";
import { getIsoWeekKey } from "@/lib/workout-plan";

// A small pull-tab pinned to the right edge instead of a SiteNav entry —
// this is a personal habit tracker, not a page meant to compete for
// attention with the rest of the dashboard.
export function WorkoutTab({ authHeaders }: { authHeaders: HeadersInit }) {
  // Starts hidden rather than defaulting to "incomplete" — a slow/failed
  // fetch should stay quiet, not flash a dot that turns out to be wrong.
  const [incomplete, setIncomplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWeekView(getIsoWeekKey(new Date()), authHeaders).then((sessions) => {
      if (cancelled || !sessions) return;
      const done = sessions.filter((s) => s.completed).length;
      setIncomplete(done < sessions.length);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Link
      to="/workout"
      title="Træning"
      aria-label="Gå til træning"
      className="glass fixed right-0 top-6 z-30 flex items-center rounded-l-2xl py-3 pl-3 pr-2 text-muted-foreground shadow-lg transition hover:pr-4 hover:text-primary"
    >
      <span className="relative">
        <Footprints className="h-5 w-5" />
        {incomplete && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary"
          />
        )}
      </span>
    </Link>
  );
}
