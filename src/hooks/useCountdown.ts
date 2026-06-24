import { useEffect, useState } from "react";

/**
 * Counts down to zero, updating once per second. Pass the number of seconds
 * remaining (or null to disable). Returns the current remaining seconds and a
 * formatted M:SS string.
 */
export function useCountdown(initialSeconds: number | null) {
  const [remaining, setRemaining] = useState<number>(initialSeconds ?? 0);

  useEffect(() => {
    if (initialSeconds == null) {
      setRemaining(0);
      return;
    }
    setRemaining(Math.max(0, Math.floor(initialSeconds)));
    const id = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const formatted = `${m}:${s.toString().padStart(2, "0")}`;
  return { remaining, formatted };
}
