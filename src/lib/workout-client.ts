import type { Difficulty, PlanSession, SessionWeekView } from "@/lib/workout-plan";

// Thin client-side wrapper around /api/public/workout(-plan). Failures are
// swallowed on purpose — a sync hiccup shouldn't interrupt a workout.
export async function fetchWeekView(
  week: string,
  authHeaders: HeadersInit,
): Promise<SessionWeekView[] | null> {
  try {
    const res = await fetch(`/api/public/workout?week=${encodeURIComponent(week)}`, {
      headers: authHeaders,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.sessions ?? null;
  } catch {
    return null;
  }
}

// Used by the heatmap's past-weeks lookups — see getWeekCompletedCount's
// comment in workout-store.ts for why this must stay a separate, cheaper
// request instead of reusing fetchWeekView.
export async function fetchWeekCompletedCount(
  week: string,
  authHeaders: HeadersInit,
): Promise<number | null> {
  try {
    const res = await fetch(`/api/public/workout?week=${encodeURIComponent(week)}&summary=1`, {
      headers: authHeaders,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.completedCount === "number" ? data.completedCount : null;
  } catch {
    return null;
  }
}

export async function submitSessionCompleted(
  week: string,
  sessionId: string,
  completed: boolean,
  authHeaders: HeadersInit,
): Promise<void> {
  await fetch("/api/public/workout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ week, sessionId, completed }),
  }).catch(() => {});
}

export async function submitExerciseRating(
  week: string,
  exerciseId: string,
  difficulty: Difficulty,
  authHeaders: HeadersInit,
): Promise<void> {
  await fetch("/api/public/workout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ week, exerciseId, difficulty }),
  }).catch(() => {});
}

export async function fetchWorkoutPlan(authHeaders: HeadersInit): Promise<PlanSession[] | null> {
  try {
    const res = await fetch("/api/public/workout-plan", { headers: authHeaders });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.sessions ?? null;
  } catch {
    return null;
  }
}

export async function saveWorkoutPlan(
  sessions: PlanSession[],
  authHeaders: HeadersInit,
): Promise<PlanSession[] | null> {
  try {
    const res = await fetch("/api/public/workout-plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(sessions),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.sessions ?? null;
  } catch {
    return null;
  }
}
