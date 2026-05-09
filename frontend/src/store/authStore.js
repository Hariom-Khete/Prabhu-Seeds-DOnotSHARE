import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,   // { id, role, name, mobile } or null
      token: null,  // string or null

      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => {
        sessionStorage.removeItem('pga-duty-status')
        set({ user: null, token: null })
      },
    }),
    {
      name: 'pga-auth',          // localStorage key
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
)
