import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Dumbbell,
  Flame,
  Footprints,
  Frown,
  Info,
  Meh,
  Smile,
  Snowflake,
} from "lucide-react";
import {
  fetchWeekCompletedCount,
  fetchWeekView,
  submitExerciseRating,
  submitSessionCompleted,
} from "@/lib/workout-client";
import {
  getIsoWeekKey,
  type Difficulty,
  type ExerciseWeekView,
  type SessionWeekView,
} from "@/lib/workout-plan";

// The plan itself (which sessions/exercises exist, in what order) lives in
// Supabase and is editable from /workout/edit — see workout-store.ts's
// getWorkoutPlan/savePlan — rather than being hardcoded here. This component
// only renders whatever getWeekView() returns for the current week.
const HISTORY_WEEKS = 8;

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Nemt",
  ok: "Passende",
  hard: "Svært",
};
const DIFFICULTY_ICON: Record<Difficulty, typeof Smile> = { easy: Smile, ok: Meh, hard: Frown };
const DIFFICULTY_ACTIVE_CLASS: Record<Difficulty, string> = {
  easy: "border-emerald-400 bg-emerald-400/15 text-emerald-400",
  ok: "border-blue-400 bg-blue-400/15 text-blue-400",
  hard: "border-rose-400 bg-rose-400/15 text-rose-400",
};

// Detail templates can embed a `{base:step}` marker (e.g. "3×{12:1}") instead
// of a plain number — swapped for base + step×N, where N is that exercise's
// own current progression step (workout-store.ts's getWeekView). Each
// exercise adapts independently from its own nemt/passende/svært history:
// easy bumps its step up, hard eases it back down.
function renderDetail(line: string, step: number) {
  return line.replace(/\{(\d+):(\d+)\}/g, (_, base, inc) =>
    String(Number(base) + Number(inc) * step),
  );
}

type WeekSummary = { key: string; done: number };

// Consecutive fully-completed weeks, most recent first. The current week
// (last in `weeks`) is skipped rather than treated as a break while it's
// still in progress — the streak only resets once a week actually ends
// without being finished.
function currentStreak(weeks: WeekSummary[], target: number) {
  let streak = 0;
  let i = weeks.length - 1;
  if (i >= 0 && weeks[i].done < target) i--;
  for (; i >= 0 && weeks[i].done >= target; i--) streak++;
  return streak;
}

function ProgressRing({ value, max, size = 56 }: { value: number; max: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? value / max : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted-foreground/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-lg tabular-nums">
        {value}/{max}
      </span>
    </div>
  );
}

function WeekHeatmap({
  weeks,
  target,
  currentWeekKey,
}: {
  weeks: WeekSummary[];
  target: number;
  currentWeekKey: string;
}) {
  // `weeks` is oldest-first (chronological); reversed here so the current,
  // still-filling week reads as the first cell instead of being tucked away
  // at the far end of the row.
  const display = [...weeks].reverse();
  return (
    <div className="flex gap-1.5">
      {display.map((w) => {
        const pct = target > 0 ? Math.round((w.done / target) * 100) : 0;
        return (
          <div
            key={w.key}
            title={`${w.key}: ${w.done}/${target}`}
            className="hairline h-5 w-5 rounded border surface-tint"
            style={
              pct > 0
                ? { backgroundColor: `color-mix(in oklch, var(--primary) ${pct}%, transparent)` }
                : undefined
            }
          >
            <span className="sr-only">
              {w.key === currentWeekKey ? "Denne uge" : w.key}: {w.done}/{target}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// A handful of little squares that fall and fade — deliberately CSS-only
// (no confetti library) to keep this dependency- and bundle-size-free.
// Math.random() is safe here since this only ever mounts after a user
// action, never during the initial (SSR-matched) render.
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      duration: 0.9 + Math.random() * 0.6,
      color: ["bg-primary", "bg-blue-400", "bg-emerald-400", "bg-pink-400"][i % 4],
      rotate: Math.round(Math.random() * 360),
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`animate-confetti-fall absolute top-0 h-2 w-2 rounded-sm ${p.color}`}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function mergeWeekView(prev: SessionWeekView[], server: SessionWeekView[]): SessionWeekView[] {
  // Only ever turns a session's box on, or adopts a rating when the local
  // copy has none yet — never reverts a check/rating just made locally
  // before this fetch resolves. step/deloadFlag/recentRatings are pure
  // server-computed read state (nothing local to protect), so those are
  // always taken fresh from the server.
  return server.map((serverSession) => {
    const localSession = prev.find((s) => s.id === serverSession.id);
    return {
      ...serverSession,
      completed: !!localSession?.completed || serverSession.completed,
      exercises: serverSession.exercises.map((serverEx) => {
        const localEx = localSession?.exercises.find((e) => e.id === serverEx.id);
        return localEx?.difficulty ? { ...serverEx, difficulty: localEx.difficulty } : serverEx;
      }),
    };
  });
}

export function WorkoutTracker({ authHeaders }: { authHeaders: HeadersInit }) {
  const [week] = useState(() => getIsoWeekKey(new Date()));
  const [sessions, setSessions] = useState<SessionWeekView[]>([]);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [pastWeeks, setPastWeeks] = useState<WeekSummary[]>([]);
  const [celebrating, setCelebrating] = useState(false);

  // Doesn't use the shared useLocalState hook: that hook's write effect can
  // fire once on mount with the pre-read default, before its own read effect's
  // update has committed — invisible for its other, single-writer consumers,
  // but here it raced the server-merge effect below and could wipe out a
  // just-checked box. Gating the write on `hydrated` closes that window.
  const [hydrated, setHydrated] = useState(false);
  const storageKey = `dash.workout.${week}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSessions(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch {}
  }, [storageKey, sessions, hydrated]);

  // Pull in whatever's already recorded server-side for this week (e.g. from
  // your phone) — see mergeWeekView for the merge rules.
  useEffect(() => {
    let cancelled = false;
    fetchWeekView(week, authHeaders).then((server) => {
      if (cancelled || !server) return;
      setSessions((prev) => mergeWeekView(prev, server));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  // Streak/heatmap only needs the previous weeks — the current week's cell
  // is overlaid from live local state below so it updates as you check
  // things off instead of only reflecting a stale fetch from mount.
  useEffect(() => {
    let cancelled = false;
    const keys: string[] = [];
    for (let i = HISTORY_WEEKS - 1; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      keys.push(getIsoWeekKey(d));
    }
    Promise.all(
      keys.map((key) =>
        fetchWeekCompletedCount(key, authHeaders).then((done) => ({ key, done: done ?? 0 })),
      ),
    ).then((results) => {
      if (!cancelled) setPastWeeks(results);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSession(sessionId: string) {
    const target = sessions.find((s) => s.id === sessionId);
    const next = !target?.completed;
    const updated = sessions.map((s) => (s.id === sessionId ? { ...s, completed: next } : s));
    setSessions(updated);
    submitSessionCompleted(week, sessionId, next, authHeaders);

    // Only a manual check that completes the week counts — computed here
    // directly (not via a doneCount-watching effect) so loading an
    // already-finished week from storage/server never triggers this.
    if (next && updated.every((s) => s.completed)) {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1600);
    }
  }

  function rateExercise(sessionId: string, exerciseId: string, difficulty: Difficulty) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : {
              ...s,
              exercises: s.exercises.map((e) => (e.id === exerciseId ? { ...e, difficulty } : e)),
            },
      ),
    );
    submitExerciseRating(week, exerciseId, difficulty, authHeaders);
  }

  const doneCount = sessions.filter((s) => s.completed).length;
  const weekHistory: WeekSummary[] = [...pastWeeks, { key: week, done: doneCount }];
  const streak = currentStreak(weekHistory, sessions.length);
  const runSessions = sessions.filter((s) => s.kind === "run");
  const strengthSessions = sessions.filter((s) => s.kind === "strength");

  return (
    <section className="glass animate-card-in relative rounded-2xl p-4 sm:p-6">
      {celebrating && <Confetti />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-center gap-4">
          <ProgressRing value={doneCount} max={sessions.length} />
          <div>
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Dumbbell className="h-3.5 w-3.5" /> Træning denne uge
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
              <Flame
                className={`h-4 w-4 ${streak > 0 ? "text-primary" : "text-muted-foreground"}`}
              />
              {streak > 0
                ? `${streak} uge${streak === 1 ? "" : "r"} i træk`
                : "Fuldfør ugen for at starte en streak"}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground sm:text-right">Seneste uger</p>
          <WeekHeatmap weeks={weekHistory} target={sessions.length} currentWeekKey={week} />
        </div>
      </div>

      {runSessions.length > 0 && (
        <div className="mt-4 border-t hairline pt-4 sm:mt-6 sm:pt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-blue-400">
            <Footprints className="h-3.5 w-3.5" /> Løb
          </h3>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
            {runSessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                onToggle={() => toggleSession(s.id)}
                onRateExercise={(exerciseId, d) => rateExercise(s.id, exerciseId, d)}
                open={openDetail === s.id}
                onToggleOpen={() => setOpenDetail((cur) => (cur === s.id ? null : s.id))}
                openInfoExerciseId={openInfo}
                onToggleInfo={(exerciseId) =>
                  setOpenInfo((cur) => (cur === exerciseId ? null : exerciseId))
                }
              />
            ))}
          </ul>
        </div>
      )}

      {strengthSessions.length > 0 && (
        <div className="mt-4 sm:mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-primary">
            <Dumbbell className="h-3.5 w-3.5" /> Styrke
          </h3>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
            {strengthSessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                onToggle={() => toggleSession(s.id)}
                onRateExercise={(exerciseId, d) => rateExercise(s.id, exerciseId, d)}
                open={openDetail === s.id}
                onToggleOpen={() => setOpenDetail((cur) => (cur === s.id ? null : s.id))}
                openInfoExerciseId={openInfo}
                onToggleInfo={(exerciseId) =>
                  setOpenInfo((cur) => (cur === exerciseId ? null : exerciseId))
                }
              />
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground sm:mt-5">
        Kør styrke-øvelserne som en circuit i den viste rækkefølge — 1 runde af alle øvelser i
        sessionen, ca. 60 sek. pause, gentag 3 runder i alt. Nulstilles automatisk hver mandag.
        Vurdér hver øvelse for sig som nemt, passende eller svært — næste uges mål justeres derefter
        automatisk, øvelse for øvelse. En ❄️ ved en øvelse betyder den har været svær 3 uger i træk
        — måske værd at sænke lidt.
      </p>
    </section>
  );
}

function SessionItem({
  session,
  onToggle,
  onRateExercise,
  open,
  onToggleOpen,
  openInfoExerciseId,
  onToggleInfo,
}: {
  session: SessionWeekView;
  onToggle: () => void;
  onRateExercise: (exerciseId: string, difficulty: Difficulty) => void;
  open: boolean;
  onToggleOpen: () => void;
  openInfoExerciseId: string | null;
  onToggleInfo: (exerciseId: string) => void;
}) {
  const isRun = session.kind === "run";
  const iconColor = isRun ? "text-blue-400" : "text-primary";
  const boxColor = isRun
    ? "border-blue-400/60 checked:border-blue-400 checked:bg-blue-400"
    : "border-primary/60 checked:border-primary checked:bg-primary";
  const Icon = isRun ? Footprints : Dumbbell;
  const checked = session.completed;

  return (
    <li className="rounded-xl hairline border surface-tint p-2.5 sm:p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        {/* Native checkboxes render an opaque white unchecked box in most
            browsers regardless of theme (accent-color only styles the
            checked fill) — appearance-none plus a manually drawn tick avoids
            that instead of fighting the OS widget. */}
        <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className={`peer h-4 w-4 shrink-0 appearance-none rounded border bg-transparent transition-colors ${boxColor}`}
          />
          <Check className="pointer-events-none absolute h-3 w-3 text-background opacity-0 peer-checked:opacity-100" />
        </span>
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        <span className="flex-1">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`text-sm ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {session.label}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onToggleOpen();
              }}
              className="text-muted-foreground hover:text-foreground sm:hidden"
              aria-label="Vis øvelser"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          </span>
          {/* Phone: tap to expand one at a time. Desktop (sm+): always
              expanded — enough room that hiding them just adds clicks. Rating
              is per exercise now, so it's gated behind the same expand state
              as the exercise text itself — you need to see which exercise
              you're rating. */}
          <ul
            className={`mt-1 space-y-1.5 text-xs text-muted-foreground sm:block ${open ? "block" : "hidden"}`}
          >
            {session.exercises.map((ex) => (
              <ExerciseLine
                key={ex.id}
                exercise={ex}
                isStrength={session.kind === "strength"}
                checked={checked}
                infoOpen={openInfoExerciseId === ex.id}
                onToggleInfo={() => onToggleInfo(ex.id)}
                onRate={(d) => onRateExercise(ex.id, d)}
              />
            ))}
          </ul>
        </span>
      </label>
    </li>
  );
}

function ExerciseLine({
  exercise,
  isStrength,
  checked,
  infoOpen,
  onToggleInfo,
  onRate,
}: {
  exercise: ExerciseWeekView;
  isStrength: boolean;
  checked: boolean;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onRate: (difficulty: Difficulty) => void;
}) {
  const hasHistory = exercise.recentRatings.length > 0;
  return (
    <li className="list-none">
      <div className="flex flex-wrap items-center gap-1">
        <span className="before:mr-1.5 before:content-['•']">
          {renderDetail(exercise.detailTemplate, exercise.step)}
        </span>
        {exercise.deloadFlag && (
          <Snowflake
            className="h-3 w-3 shrink-0 text-sky-400"
            aria-label="Svært 3 uger i træk — en uge holdes automatisk i ro"
          >
            <title>Svært 3 uger i træk — en uge holdes automatisk i ro</title>
          </Snowflake>
        )}
        {isStrength && hasHistory && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleInfo();
            }}
            className="-m-1 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Hvorfor dette tal?"
          >
            <Info className="h-3 w-3" />
          </button>
        )}
      </div>
      {infoOpen && hasHistory && (
        <p className="mt-0.5 pl-3 text-[11px] text-muted-foreground/80">
          Sidste uger:{" "}
          {[...exercise.recentRatings]
            .reverse()
            .map((r) => DIFFICULTY_LABEL[r.difficulty])
            .join(" → ")}
        </p>
      )}
      {isStrength && checked && (
        <div className="mt-1 flex gap-1.5 pl-3">
          {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => {
            const DifficultyIcon = DIFFICULTY_ICON[d];
            const active = exercise.difficulty === d;
            return (
              <button
                key={d}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRate(d);
                }}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition ${
                  active
                    ? DIFFICULTY_ACTIVE_CLASS[d]
                    : "hairline text-muted-foreground hover:text-foreground"
                }`}
              >
                <DifficultyIcon className="h-3 w-3" />
                {DIFFICULTY_LABEL[d]}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
