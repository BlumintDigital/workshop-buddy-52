import { useEffect, useRef, useState } from "react";

/**
 * Runs `callback` every `ms` while the tab is visible. Pauses in background tabs and runs once
 * straight away when the tab becomes visible again, so a page left open all day doesn't keep
 * polling the database.
 */
export function useVisibleInterval(callback: () => void, ms: number, enabled = true) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let id: number | undefined;
    const start = () => {
      if (id === undefined) id = window.setInterval(() => saved.current(), ms);
    };
    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        saved.current();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}

/** The current time, refreshed every `ms` while visible. For time-based filters; makes no requests. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useVisibleInterval(() => setNow(Date.now()), ms);
  return now;
}
