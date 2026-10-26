import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Alle 5 bogstaver lange, almindelige danske ord. Gæt behøver ikke stå i
// denne liste (der valideres kun på længde) — den bruges kun til at vælge
// dagens hemmelige ord.
const WORDS = [
  "HYGGE",
  "TORSK",
  "SUPPE",
  "KAFFE",
  "STOLE",
  "BLADE",
  "HUSET",
  "SKOLE",
  "PLADS",
  "BANAN",
  "TOMAT",
  "FISKE",
  "HESTE",
  "GADER",
  "FJELD",
  "STORM",
  "REGNE",
  "SJOVE",
  "GRØNT",
  "RØDME",
  "SMUKT",
  "VARME",
  "KOLDT",
  "LYKKE",
  "DRØMT",
  "HAVET",
  "SKYEN",
  "VINDE",
  "TABTE",
  "BOLDE",
  "FESTE",
  "DANSE",
  "SYNGE",
  "LÆSER",
  "SKREV",
  "TEGNE",
  "MALER",
  "BAGER",
  "LÆGER",
  "NÆSTE",
  "FØRST",
  "SIDST",
  "ANDEN",
  "FEMTE",
  "HALVE",
  "STORE",
  "GRØNE",
  "HVIDE",
  "SORTE",
  "LYSET",
  "MØRKE",
  "TYVEN",
  "HELTE",
];

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Å"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Æ", "Ø"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

type ScoredState = "correct" | "present" | "absent";
type TileState = ScoredState | "empty";

function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todaysWord(dateKey: string) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  return WORDS[hash % WORDS.length];
}

function scoreGuess(guess: string, answer: string): ScoredState[] {
  const result: ScoredState[] = Array(guess.length).fill("absent");
  const answerLetters = answer.split("");
  const used = Array(answer.length).fill(false);

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answerLetters[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "correct") continue;
    const idx = answerLetters.findIndex((l, j) => l === guess[i] && !used[j]);
    if (idx !== -1) {
      result[i] = "present";
      used[idx] = true;
    }
  }
  return result;
}

const tileClass: Record<TileState, string> = {
  correct: "border-green-600 bg-green-600 text-white",
  present: "border-yellow-500 bg-yellow-500 text-white",
  absent: "hairline border surface-tint text-muted-foreground",
  empty: "hairline border text-foreground",
};

const keyClass: Record<TileState, string> = {
  correct: "bg-green-600 text-white",
  present: "bg-yellow-500 text-white",
  absent: "surface-tint text-muted-foreground",
  empty: "surface-tint text-foreground hover:surface-tint-strong",
};

export function WordleGame({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dateKey = useMemo(() => localDateKey(new Date()), []);
  const answer = useMemo(() => todaysWord(dateKey), [dateKey]);
  const storageKey = `dash.wordle.${dateKey}`;

  // Loaded lazily (once, synchronously) instead of via a separate effect —
  // an effect-based load racing against an effect-based save would let the
  // save effect's first (pre-load) run overwrite a real saved result with [].
  const [guesses, setGuesses] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [current, setCurrent] = useState("");
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Native keydown events can fire several times synchronously (fast typing,
  // or our own test harness) before React commits a re-render. Functions
  // called from the listener must not read `guesses`/`current` from their
  // render-time closure — they'd see stale values. Refs mirror the latest
  // value synchronously so imperative logic below is always up to date.
  const guessesRef = useRef<string[]>(guesses);
  const currentRef = useRef("");

  function updateGuesses(next: string[]) {
    guessesRef.current = next;
    setGuesses(next);
  }
  function updateCurrent(next: string) {
    currentRef.current = next;
    setCurrent(next);
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(guesses));
    } catch {}
  }, [storageKey, guesses]);

  const won = guesses.includes(answer);
  const gameOver = won || guesses.length >= MAX_GUESSES;

  function isGameOver() {
    return guessesRef.current.includes(answer) || guessesRef.current.length >= MAX_GUESSES;
  }

  function flashMessage(text: string, ms = 1300) {
    setMessage(text);
    setTimeout(() => setMessage(null), ms);
  }

  function commitLetter(letter: string) {
    if (isGameOver()) return;
    const c = currentRef.current;
    if (c.length < WORD_LENGTH) updateCurrent(c + letter);
  }

  function backspace() {
    if (isGameOver()) return;
    updateCurrent(currentRef.current.slice(0, -1));
  }

  function submitGuess() {
    if (isGameOver()) return;
    const guess = currentRef.current;
    if (guess.length !== WORD_LENGTH) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      flashMessage("For få bogstaver");
      return;
    }
    const next = [...guessesRef.current, guess];
    updateGuesses(next);
    updateCurrent("");
    if (guess === answer) {
      flashMessage(
        ["Genialt!", "Flot!", "Godt klaret!", "Fedt!", "Okay!", "Uf, lige akkurat!"][
          next.length - 1
        ] ?? "Vundet!",
        2500,
      );
    } else if (next.length >= MAX_GUESSES) {
      flashMessage(`Ordet var ${answer}`, 3000);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") submitGuess();
      else if (e.key === "Backspace") backspace();
      else {
        const letter = e.key.toUpperCase();
        if (/^[A-ZÆØÅ]$/.test(letter)) commitLetter(letter);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, answer]);

  const keyStatuses = useMemo(() => {
    const rank: Record<ScoredState, number> = { correct: 3, present: 2, absent: 1 };
    const statuses: Partial<Record<string, ScoredState>> = {};
    for (const g of guesses) {
      const scored = scoreGuess(g, answer);
      g.split("").forEach((letter, i) => {
        const s = scored[i];
        const prev = statuses[letter];
        if (!prev || rank[s] > rank[prev]) statuses[letter] = s;
      });
    }
    return statuses;
  }, [guesses, answer]);

  function shareResult() {
    const lines = guesses
      .map((g) =>
        scoreGuess(g, answer)
          .map((s) => (s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛"))
          .join(""),
      )
      .join("\n");
    const text = `Dashboard-ordet ${dateKey} ${won ? guesses.length : "X"}/${MAX_GUESSES}\n\n${lines}`;
    navigator.clipboard
      ?.writeText(text)
      .then(() => flashMessage("Kopieret til udklipsholder!"))
      .catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dagens ord</DialogTitle>
          <DialogDescription>Gæt et 5-bogstavs ord. Nyt ord hver dag.</DialogDescription>
        </DialogHeader>

        <div className={`flex flex-col items-center gap-1.5 ${shake ? "animate-shake" : ""}`}>
          {Array.from({ length: MAX_GUESSES }).map((_, row) => {
            const isSubmitted = row < guesses.length;
            const rowGuess = isSubmitted ? guesses[row] : row === guesses.length ? current : "";
            const scored = isSubmitted ? scoreGuess(guesses[row], answer) : [];
            return (
              <div key={row} className="flex gap-1.5">
                {Array.from({ length: WORD_LENGTH }).map((_, col) => {
                  const letter = rowGuess[col] ?? "";
                  const state: TileState = isSubmitted ? scored[col] : "empty";
                  return (
                    <div
                      key={col}
                      className={`flex h-11 w-11 items-center justify-center rounded-md border text-lg font-bold uppercase ${tileClass[state]}`}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {message && <div className="text-center text-sm text-muted-foreground">{message}</div>}

        {gameOver ? (
          <button
            onClick={shareResult}
            className="mx-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Del resultat
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            {KEY_ROWS.map((row, i) => (
              <div key={i} className="flex gap-1">
                {row.map((key) => {
                  if (key === "ENTER" || key === "BACK") {
                    return (
                      <button
                        key={key}
                        onClick={() => (key === "ENTER" ? submitGuess() : backspace())}
                        className="h-[42px] rounded-md surface-tint px-2 text-xs font-medium hover:surface-tint-strong"
                      >
                        {key === "ENTER" ? "Enter" : "⌫"}
                      </button>
                    );
                  }
                  const state = keyStatuses[key] ?? "empty";
                  return (
                    <button
                      key={key}
                      onClick={() => commitLetter(key)}
                      className={`h-[42px] w-6 rounded-md text-xs font-semibold uppercase transition sm:w-7 ${keyClass[state]}`}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
