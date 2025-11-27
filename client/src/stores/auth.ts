import { create } from "zustand";
import { useSocketStore } from "./socket";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  fullName?: string;
  permissions?: string[];
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  kickedMessage?: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  setKickedMessage: (msg: string | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      kickedMessage: null,

      login: (user, token) => {
        set({ user, token, isAuthenticated: true });
        try {
          // If socket is already connected, identify this session so the server
          // can add this socket to the user's room (enables server-side kicks).
          const socket = useSocketStore.getState().socket;
          if (socket) {
            socket.emit("auth:identify", { token });
          }
        } catch (e) {
          // ignore silently
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },
      setKickedMessage: (msg) => set({ kickedMessage: msg }),
    }),
    {
      name: "auth-storage",
    }
  )
);
