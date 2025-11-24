import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from './auth'
import toast from 'react-hot-toast'

interface SocketStore {
  socket: Socket | null
  connected: boolean
  connect: () => void
  disconnect: () => void
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,

  connect: () => {
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id)
      set({ connected: true })

      // Identify this socket with the server for single-session handling
      try {
        const token = useAuthStore.getState().token
        if (token) socket.emit('auth:identify', { token })
      } catch {}
    })

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected')
      set({ connected: false })
      try {
        const unsub = (socket as any)?._authUnsub
        if (typeof unsub === 'function') unsub()
      } catch (e) {}
    })

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
    })

    // Handle kick from server (single-session enforcement)
    socket.on('auth:kick', (payload: { message?: string }) => {
      const msg = payload?.message || 'Bạn đã bị đăng xuất vì đăng nhập từ thiết bị khác'
      try {
        // Set kicked message on auth store so UI (Layout) can display a modal
        useAuthStore.getState().setKickedMessage(msg)
      } catch (err) {
        console.error('Failed to set kicked message', err)
      }
      // Keep socket open briefly; UI will perform logout when user confirms modal
    })

    // Handle file share notifications
    socket.on('files:shared', (payload: any) => {
      try {
        toast.success('A file was shared with you')
        // Dispatch global event for pages to react (e.g., refresh file list)
        try {
          window.dispatchEvent(new CustomEvent('files:shared', { detail: payload }))
        } catch {}
      } catch (e) {
        console.error('Error handling files:shared event', e)
      }
    })

    socket.on('files:revoked', (payload: any) => {
      try {
        toast.error('A file share was revoked')
        try {
          window.dispatchEvent(new CustomEvent('files:revoked', { detail: payload }))
        } catch {}
      } catch (e) {
        console.error('Error handling files:revoked', e)
      }
    })

    // Note: identification on login is handled in the auth store to avoid
    // subscribing here (types mismatch across Zustand versions). Keep this
    // socket ready to accept `auth:identify` emits from the auth store.

    set({ socket })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, connected: false })
    }
  },
}))
