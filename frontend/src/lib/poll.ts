import { useCallback, useEffect, useRef } from "react";

const MAX_BACKOFF_MS = 30_000;

export function usePolling(task: () => Promise<boolean | void>, intervalMs: number, enabled = true) {
  const latest = useRef(task);
  latest.current = task;
  const poke = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let failures = 0;
    let timer = 0;

    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || document.hidden) return;
      timer = window.setTimeout(tick, Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS));
    };

    async function tick() {
      window.clearTimeout(timer);
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        const ok = await latest.current();
        failures = ok === false ? failures + 1 : 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
      }
      schedule();
    }

    const onVisibility = () => {
      if (!document.hidden) {
        failures = 0;
        void tick();
      }
    };

    poke.current = () => void tick();
    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      poke.current = () => {};
    };
  }, [intervalMs, enabled]);

  return useCallback(() => poke.current(), []);
}
