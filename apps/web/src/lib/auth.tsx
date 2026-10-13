'use client';

import { useQueryClient } from '@tanstack/react-query';
import { can, type Permission } from '@app/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, session } from './api';
import type { User, WorkspaceSummary } from './types';

const WS_KEY = 'amz.workspaceId';

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary | null;
  setSession(accessToken: string): Promise<void>;
  switchWorkspace(id: string): void;
  reload(): Promise<void>;
  logout(): Promise<void>;
  can(permission: Permission): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredWorkspace(): string | null {
  try {
    return localStorage.getItem(WS_KEY);
  } catch {
    return null;
  }
}

function storeWorkspace(id: string) {
  try {
    localStorage.setItem(WS_KEY, id);
  } catch {
    /* storage unavailable (private mode) — selection just won't persist */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const me = await api<{ user: User; workspaces: WorkspaceSummary[] }>('/auth/me', { noWorkspace: true });
    setUser(me.user);
    setWorkspaces(me.workspaces);
    const stored = readStoredWorkspace();
    const chosen = me.workspaces.find((w) => w.id === stored) ?? me.workspaces[0] ?? null;
    session.setWorkspace(chosen?.id ?? null);
    setWorkspaceId(chosen?.id ?? null);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    session.onLost(() => {
      setStatus('anonymous');
      setUser(null);
    });
    refreshSession().then((ok) => (ok ? loadMe().catch(() => setStatus('anonymous')) : setStatus('anonymous')));
  }, [loadMe]);

  const value = useMemo<AuthState>(() => {
    const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
    return {
      status,
      user,
      workspaces,
      workspace,
      async setSession(token) {
        session.setToken(token);
        await loadMe();
      },
      switchWorkspace(id) {
        storeWorkspace(id);
        session.setWorkspace(id);
        setWorkspaceId(id);
        qc.clear(); // never show one workspace's cached data in another
      },
      reload: loadMe,
      async logout() {
        await api('/auth/logout', { method: 'POST', noWorkspace: true }).catch(() => undefined);
        session.setToken(null);
        session.setWorkspace(null);
        qc.clear();
        setUser(null);
        setStatus('anonymous');
      },
      can: (permission) => can(workspace?.role, permission),
    };
  }, [status, user, workspaces, workspaceId, loadMe, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
