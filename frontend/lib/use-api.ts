"use client";
import { useCallback, useEffect, useState } from "react";

export function useApi<T>(loader: () => Promise<T>, initial: T, deps: unknown[] = []) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const dependencyKey = deps.map(String).join("|");
  const reload = useCallback(() => setReloadVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await loader();
        if (active) setData(response);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load data");
      } finally {
        if (active) setLoading(false);
      }
    }
    void dependencyKey;
    void reloadVersion;
    void load();
    return () => { active = false; };
    // Callers explicitly control dependencies through the deps argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey, reloadVersion]);

  return { data, setData, loading, error, reload };
}
