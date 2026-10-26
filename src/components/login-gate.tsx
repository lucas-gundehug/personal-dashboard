import { useState } from "react";
import { site } from "@/site.config";

// Shared by every login-gated route (/, /workout, …). The code itself lives
// only server-side (see src/lib/auth.ts) and is verified there — the client
// never sees or stores it, just a signed token held in memory for this tab.
// Nothing is persisted (no cookie, no storage), so a refresh always lands
// back on this screen.
export const ACCESS_CODE_LENGTH = 4;

export function LoginGate({ onUnlock }: { onUnlock: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, ACCESS_CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === ACCESS_CODE_LENGTH) {
      setChecking(true);
      try {
        const res = await fetch("/api/public/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: digits }),
        }).then((r) => r.json());
        if (res.ok && res.token) {
          onUnlock(res.token);
          return;
        }
        setError(
          res.error === "locked"
            ? "For mange forsøg — vent lidt og prøv igen."
            : "Forkert kode, prøv igen.",
        );
      } catch {
        setError("Forkert kode, prøv igen.");
      }
      setCode("");
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass w-full max-w-sm rounded-2xl p-8 text-center">
        <h1 className="font-sans text-3xl font-bold tracking-tight">
          Velkommen, <span className="text-primary">{site.ownerName}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Indtast kode for at fortsætte</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          disabled={checking}
          inputMode="numeric"
          type="password"
          maxLength={ACCESS_CODE_LENGTH}
          className={`mt-6 w-full rounded-md hairline border surface-tint px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary/60 ${
            error ? "border-destructive focus:border-destructive" : ""
          }`}
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
