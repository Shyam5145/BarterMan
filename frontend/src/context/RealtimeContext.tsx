import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { io, type Socket } from "socket.io-client"
import { firebaseAuth } from "../lib/firebase"
import { fetchUnreadCount } from "../lib/chat"
import { useAuth } from "./AuthContext"

type RealtimeValue = {
  /** Connected Socket.IO client while a signed-in, profile-complete user is present; otherwise null. */
  socket: Socket | null
  connected: boolean
  /** Unread messages across the inbox, kept current by the server. */
  unreadTotal: number
  refreshUnread: () => void
}

const RealtimeContext = createContext<RealtimeValue | null>(null)

// The API on Render in production; the Vite dev server (which proxies /socket.io) otherwise.
const SOCKET_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") || undefined
const RETRY_AFTER_REFUSAL_MS = 5000

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const userId = status === "ready" ? user?.id : undefined
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)

  const refreshUnread = useCallback(() => {
    fetchUnreadCount().then(setUnreadTotal).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return

    const options = {
      autoConnect: false,
      transports: ["websocket", "polling"],
      // Called on every (re)connect, so an expired token is refreshed automatically.
      auth: (send: (data: { token?: string }) => void) => {
        const current = firebaseAuth?.currentUser
        if (!current) return send({})
        current.getIdToken().then((token) => send({ token }), () => send({}))
      },
    }
    const client = SOCKET_URL ? io(SOCKET_URL, options) : io(options)
    let retryTimer: number | undefined

    client.on("connect", () => {
      setConnected(true)
      refreshUnread()
    })
    client.on("disconnect", () => setConnected(false))
    client.on("unread:count", ({ total }: { total: number }) => setUnreadTotal(total))
    client.on("connect_error", () => {
      // A refused handshake (e.g. expired token) is not retried by Socket.IO itself.
      if (!client.active) retryTimer = window.setTimeout(() => client.connect(), RETRY_AFTER_REFUSAL_MS)
    })

    client.connect()
    setSocket(client)

    return () => {
      window.clearTimeout(retryTimer)
      client.removeAllListeners()
      client.disconnect()
      setSocket(null)
      setConnected(false)
      setUnreadTotal(0)
    }
  }, [userId, refreshUnread])

  return (
    <RealtimeContext.Provider value={{ socket, connected, unreadTotal, refreshUnread }}>{children}</RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const value = useContext(RealtimeContext)
  if (!value) throw new Error("useRealtime must be used inside RealtimeProvider")
  return value
}
