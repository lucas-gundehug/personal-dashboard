import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Dumbbell, Footprints, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWorkoutPlan, saveWorkoutPlan } from "@/lib/workout-client";
import type { PlanExercise, PlanSession, SessionKind } from "@/lib/workout-plan";

const inputClass =
  "w-full rounded-md hairline border surface-tint px-2.5 py-1.5 text-sm outline-none focus:border-primary/60";

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function WorkoutPlanEditor({ authHeaders }: { authHeaders: HeadersInit }) {
  const [sessions, setSessions] = useState<PlanSession[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWorkoutPlan(authHeaders).then((plan) => {
      if (plan) setSessions(plan);
      else toast("Kunne ikke hente træningsplanen");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sessions) {
    return <p className="text-sm text-muted-foreground">Indlæser…</p>;
  }

  function updateSession(id: string, patch: Partial<PlanSession>) {
    setSessions((prev) => prev!.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function moveSession(index: number, direction: -1 | 1) {
    setSessions((prev) => moveItem(prev!, index, direction));
  }

  function removeSession(id: string) {
    setSessions((prev) => prev!.filter((s) => s.id !== id));
  }

  function addSession(kind: SessionKind) {
    setSessions((prev) => [
      ...prev!,
      {
        id: crypto.randomUUID(),
        kind,
        label: kind === "run" ? "Nyt løb" : "Ny styrke-session",
        position: prev!.length,
        exercises: [],
      },
    ]);
  }

  function updateExercise(sessionId: string, exerciseId: string, patch: Partial<PlanExercise>) {
    setSessions((prev) =>
      prev!.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              exercises: s.exercises.map((e) => (e.id === exerciseId ? { ...e, ...patch } : e)),
            },
      ),
    );
  }

  function moveExercise(sessionId: string, index: number, direction: -1 | 1) {
    setSessions((prev) =>
      prev!.map((s) =>
        s.id !== sessionId ? s : { ...s, exercises: moveItem(s.exercises, index, direction) },
      ),
    );
  }

  function removeExercise(sessionId: string, exerciseId: string) {
    setSessions((prev) =>
      prev!.map((s) =>
        s.id !== sessionId
          ? s
          : { ...s, exercises: s.exercises.filter((e) => e.id !== exerciseId) },
      ),
    );
  }

  function addExercise(sessionId: string) {
    setSessions((prev) =>
      prev!.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              exercises: [
                ...s.exercises,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  detailTemplate: "",
                  position: s.exercises.length,
                },
              ],
            },
      ),
    );
  }

  async function save() {
    setSaving(true);
    const saved = await saveWorkoutPlan(sessions!, authHeaders);
    setSaving(false);
    if (saved) {
      setSessions(saved);
      toast("Træningsplan gemt");
    } else {
      toast("Kunne ikke gemme — prøv igen");
    }
  }

  return (
    <div className="space-y-4">
      {sessions.map((session, sessionIndex) => (
        <div key={session.id} className="rounded-xl hairline border surface-tint p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {session.kind === "run" ? (
                <Footprints className="h-4 w-4 shrink-0 text-blue-400" />
              ) : (
                <Dumbbell className="h-4 w-4 shrink-0 text-primary" />
              )}
              <input
                value={session.label}
                onChange={(e) => updateSession(session.id, { label: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
                placeholder="Session-navn"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={session.kind}
                onChange={(e) => updateSession(session.id, { kind: e.target.value as SessionKind })}
                className={`${inputClass} flex-1 sm:flex-initial`}
                style={{ width: "auto" }}
              >
                <option value="run">Løb</option>
                <option value="strength">Styrke</option>
              </select>
              <div className="ml-auto flex items-center gap-1 sm:ml-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={sessionIndex === 0}
                  onClick={() => moveSession(sessionIndex, -1)}
                  aria-label="Flyt session op"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={sessionIndex === sessions.length - 1}
                  onClick={() => moveSession(sessionIndex, 1)}
                  aria-label="Flyt session ned"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSession(session.id)}
                  aria-label="Slet session"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>

          <ul className="mt-2 space-y-1.5 pl-6">
            {session.exercises.map((exercise, exerciseIndex) => (
              <li
                key={exercise.id}
                className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2"
              >
                <input
                  value={exercise.label}
                  onChange={(e) =>
                    updateExercise(session.id, exercise.id, { label: e.target.value })
                  }
                  className={`${inputClass} w-full sm:w-40 sm:shrink-0`}
                  placeholder="Øvelsesnavn"
                />
                <input
                  value={exercise.detailTemplate}
                  onChange={(e) =>
                    updateExercise(session.id, exercise.id, { detailTemplate: e.target.value })
                  }
                  className={`${inputClass} min-w-0 w-full sm:flex-1`}
                  placeholder="F.eks. Håndvægt-gulvpres 3×{12:1}"
                />
                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={exerciseIndex === 0}
                    onClick={() => moveExercise(session.id, exerciseIndex, -1)}
                    aria-label="Flyt øvelse op"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={exerciseIndex === session.exercises.length - 1}
                    onClick={() => moveExercise(session.id, exerciseIndex, 1)}
                    aria-label="Flyt øvelse ned"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExercise(session.id, exercise.id)}
                    aria-label="Slet øvelse"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 ml-6"
            onClick={() => addExercise(session.id)}
          >
            <Plus className="h-3.5 w-3.5" /> Tilføj øvelse
          </Button>
          <p className="mt-2 pl-6 text-[11px] text-muted-foreground">
            Skriv <code>{"{base:step}"}</code> i stedet for et tal for at gøre det et progressivt
            mål — f.eks. <code>3×{"{12:1}"}</code> starter ved 12 og stiger 1 ad gangen, styret af
            nemt/passende/svært-vurderinger.
          </p>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addSession("run")}>
          <Plus className="h-3.5 w-3.5" /> Tilføj løbesession
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addSession("strength")}>
          <Plus className="h-3.5 w-3.5" /> Tilføj styrke-session
        </Button>
      </div>

      <Button type="button" onClick={save} disabled={saving} className="w-full sm:w-auto">
        {saving ? "Gemmer…" : "Gem plan"}
      </Button>
    </div>
  );
}
