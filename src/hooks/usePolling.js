import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Generic polling hook — pauses when document is hidden.
 * @param {Function} fetcher — async function that returns data
 * @param {number} intervalMs — polling interval
 * @param {boolean} enabled — whether polling is active
 */
export function usePolling(fetcher, intervalMs, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      return result;
    } catch (e) {
      setError(e);
      throw e;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let timer;

    const poll = async () => {
      if (!active || document.hidden) return;
      try {
        const result = await fetcherRef.current();
        if (active) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (active) {
          setError(e);
          setLoading(false);
        }
      }
    };

    // Initial fetch
    poll();

    // Start interval
    timer = setInterval(poll, intervalMs);

    // Re-poll when tab becomes visible
    const onVisibilityChange = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);

  return { data, error, loading, refetch };
}
