import { useEffect, useRef, useState } from "react";

/**
 * Calls `fetcher()` immediately, then every `intervalMs`, and keeps the
 * latest resolved value in state. Used for the endpoints that change on
 * their own (incidents, edge status, ledger) without the user doing
 * anything — so the console feels alive during a demo instead of static.
 *
 * Errors are kept (not thrown) so one failed poll doesn't tear down the
 * UI — e.g. if the backend hasn't been started yet.
 */
export function usePoll(fetcher, intervalMs = 5000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const result = await fetcherRef.current();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
