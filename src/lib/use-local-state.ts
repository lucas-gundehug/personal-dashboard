import { useEffect, useState } from "react";

// Reads localStorage after mount (so SSR never sees a mismatched value) and
// writes back on every change. Used for anything that should survive a
// refresh but doesn't need to be shared across devices.
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setV(JSON.parse(raw));
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV] as const;
}
