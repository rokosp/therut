import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Loads data when the screen comes into focus, with a manual reload for pull-to-refresh.
 * With pollMs, it also refreshes quietly in the background while the screen is focused
 * and the app is open. shouldSkip lets a screen pause a refresh (e.g. while saving).
 */
export function useLoad<T>(
  load: () => Promise<T>,
  deps: unknown[],
  opts: { pollMs?: number; shouldSkip?: () => boolean } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      reload();
      return () => {
        focused.current = false;
      };
    }, [reload]),
  );

  useEffect(() => {
    if (!opts.pollMs) return;
    const timer = setInterval(async () => {
      if (!focused.current || AppState.currentState !== 'active' || optsRef.current.shouldSkip?.()) return;
      try {
        const next = await loadRef.current();
        // A save may have started while we were fetching; keep the local edit.
        if (!optsRef.current.shouldSkip?.()) setData(next);
      } catch {
        // Quiet refresh: keep showing the last good data.
      }
    }, opts.pollMs);
    return () => clearInterval(timer);
  }, [opts.pollMs]);

  return { data, error, loading, reload, setData };
}

/** Run an async action, tracking busy state and turning errors into a message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
