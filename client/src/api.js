import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL || '';
const KEY = 'cadence.token';

export const token = {
  get: () => localStorage.getItem(KEY),
  set: (t) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && token.get()) {
    token.clear();
    window.dispatchEvent(new Event('cadence:signed-out'));
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

/** Tiny data hook: { data, loading, error, reload, setData } */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const alive = useRef(true);
  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api(path);
        if (alive.current) setState({ data, loading: false, error: null });
      } catch (error) {
        if (alive.current) setState((s) => ({ ...s, loading: false, error }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps]
  );
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);
  return { ...state, reload: () => load(true), setData: (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })) };
}
