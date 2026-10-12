import { create } from 'zustand';
import type { UserDto, TenantDto } from '@salon/core';
import { api } from './api';

interface SessionState {
  user: UserDto | null;
  tenant: TenantDto | null;
  status: 'loading' | 'authed' | 'anon';
  load: () => Promise<void>;
  setUser: (u: UserDto | null, t?: TenantDto | null) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  tenant: null,
  status: 'loading',
  async load() {
    try {
      const me = await api.get<{ user: UserDto; tenant: TenantDto }>('/auth/me');
      set({ user: me.user ?? me as unknown as UserDto, tenant: (me as { tenant?: TenantDto }).tenant ?? null, status: 'authed' });
    } catch {
      set({ user: null, tenant: null, status: 'anon' });
    }
  },
  setUser(u, t) {
    set({ user: u, tenant: t ?? null, status: u ? 'authed' : 'anon' });
  },
  clear() {
    set({ user: null, tenant: null, status: 'anon' });
  },
}));
