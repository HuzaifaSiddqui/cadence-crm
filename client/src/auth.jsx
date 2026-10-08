import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, token } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(Boolean(token.get()));

  const refresh = useCallback(async () => {
    try {
      setSession(await api('/auth/me'));
    } catch {
      token.clear();
      setSession(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    if (token.get()) refresh();
    const out = () => setSession(null);
    window.addEventListener('cadence:signed-out', out);
    return () => window.removeEventListener('cadence:signed-out', out);
  }, [refresh]);

  const accept = (res) => { token.set(res.token); setSession(res); };

  const value = useMemo(() => {
    const role = session?.user?.role;
    return {
      session, booting, refresh,
      user: session?.user, workspace: session?.workspace, plan: session?.plan, usage: session?.usage,
      isAdmin: role === 'admin', isManager: role === 'admin' || role === 'manager',
      login: async (email, password) => accept(await api('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (body) => accept(await api('/auth/register', { method: 'POST', body })),
      acceptInvite: async (tokenStr, body) => accept(await api(`/auth/invite/${tokenStr}/accept`, { method: 'POST', body })),
      logout: () => { token.clear(); setSession(null); },
    };
  }, [session, booting, refresh]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
