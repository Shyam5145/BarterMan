import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Avatar } from "../components/Avatar"
import { OfferCard, OfferComposer } from "../components/OfferCards"
import { fetchConversationOffer, type Offer, type OfferUpdatedEvent } from "../lib/offers"
import { useAuth } from "../context/AuthContext"
import { useRealtime } from "../context/RealtimeContext"
import { useIsMobile } from "../hooks/useIsMobile"
import { fetchConversation, fetchConversations, fetchMessages, markConversationRead, sendMessage, startConversation } from "../lib/chat"
import { formatListingPrice, statusLabel } from "../lib/listings"
import {
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type Conversation,
  type ConversationReadEvent,
  type MessageNewEvent,
  type TypingEvent,
} from "../types/chat"

type MessagesRoute = `/product/${string}` | "/marketplace"

/** A message as shown on screen; local ones are pending until the server confirms them. */
type DisplayMessage = ChatMessage & { clientId?: string; pending?: boolean; failed?: boolean }

type Thread = {
  status: "loading" | "ready" | "error"
  items: DisplayMessage[]
  hasMore: boolean
  loadingOlder: boolean
  error?: string
}

const EMPTY_THREAD: Thread = { status: "loading", items: [], hasMore: false, loadingOlder: false }
const QUICK_REPLIES = [
  "Hi! Is this still available?",
  "What condition is it in?",
  "Can we meet on campus?",
  "Is the price negotiable?",
]
const FIRST_MESSAGE = "Hi! Is this still available?"
const TYPING_RESEND_MS = 2500
const TYPING_IDLE_MS = 3000
const TYPING_DISPLAY_MS = 6000
/** Listing statuses only the seller can open. */
const OWNER_ONLY_STATUSES = new Set(["draft", "archived"])

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" })
const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })
const longDateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysAgo(iso: string) {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000)
}

/** Inbox timestamp: time today, then "Yesterday", weekday, or date. */
function listTime(iso: string | null) {
  if (!iso) return ""
  const days = daysAgo(iso)
  if (days <= 0) return timeFormat.format(new Date(iso))
  if (days === 1) return "Yesterday"
  if (days < 7) return weekdayFormat.format(new Date(iso))
  return shortDateFormat.format(new Date(iso))
}

function dayLabel(iso: string) {
  const days = daysAgo(iso)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  return longDateFormat.format(new Date(iso))
}

function activityTime(conversation: Conversation) {
  return new Date(conversation.lastMessageAt ?? conversation.createdAt).getTime()
}

function sortConversations(items: Conversation[]) {
  return [...items].sort((left, right) => activityTime(right) - activityTime(left))
}

function listingMeta(conversation: Conversation) {
  const { listing } = conversation
  if (!listing.status) return "This listing has been removed"
  const price = listing.listingType
    ? formatListingPrice({
        listingType: listing.listingType,
        price: listing.price,
        rentalPrice: listing.rentalPrice,
        rentalDuration: listing.rentalDuration ?? "",
      })
    : ""
  const state = listing.status === "active" ? "" : statusLabel(listing.status)
  return [price, state].filter(Boolean).join(" · ")
}

/** From the signed-in user's side: they are buying, or someone is asking about their listing. */
function roleLabel(conversation: Conversation) {
  return conversation.role === "buyer" ? "Buying" : "Selling"
}

function otherSubtitle(conversation: Conversation) {
  const { otherUser } = conversation
  return [otherUser.course, otherUser.year].filter(Boolean).join(" · ") || otherUser.college || "Verified student"
}

function newClientId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Real-time inbox. History and sending go through the REST API; new messages, typing and
 * read receipts arrive over Socket.IO. `embedded` (Seller Hub tab) skips URL syncing.
 */
export default function Messages({ go, embedded = false }: { go: (route: MessagesRoute) => void; embedded?: boolean }) {
  const { user } = useAuth()
  const myId = user?.id ?? ""
  const { socket, connected } = useRealtime()
  const isMobile = useIsMobile()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [listState, setListState] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [threads, setThreads] = useState<Record<string, Thread>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [typing, setTyping] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Latest offer per conversation (null = none yet); decides which offer card shows actions.
  const [offers, setOffers] = useState<Record<string, Offer | null>>({})
  // Conversation whose "₹ Offer" composer is open.
  const [offerComposerFor, setOfferComposerFor] = useState<string | null>(null)

  const activeIdRef = useRef(activeId)
  const chatBodyRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null)
  const readingRef = useRef(new Set<string>())
  const typingTimersRef = useRef(new Map<string, number>())
  const typingSentRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 })
  const typingIdleTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null
  const activeThread = activeId ? threads[activeId] : undefined

  /** Adds or replaces a conversation, ignoring a copy older than the one already shown. */
  const upsertConversation = useCallback((incoming: Conversation) => {
    setConversations((previous) => {
      const existing = previous.find((conversation) => conversation.id === incoming.id)
      if (existing && activityTime(existing) > activityTime(incoming)) return previous
      return sortConversations([incoming, ...previous.filter((conversation) => conversation.id !== incoming.id)])
    })
  }, [])

  /** Puts a saved message into its thread, replacing the matching pending bubble if there is one. */
  const settleMessage = useCallback((conversationId: string, message: ChatMessage, clientId?: string) => {
    setThreads((previous) => {
      const thread = previous[conversationId]
      if (!thread) return previous
      let items = thread.items
      if (items.some((item) => item.id === message.id)) {
        if (clientId) items = items.filter((item) => item.clientId !== clientId || item.id === message.id)
      } else if (clientId && items.some((item) => item.clientId === clientId)) {
        items = items.map((item) => (item.clientId === clientId ? { ...message, clientId } : item))
      } else {
        items = [...items, message]
      }
      return items === thread.items ? previous : { ...previous, [conversationId]: { ...thread, items } }
    })
  }, [])

  const loadThread = useCallback(async (conversationId: string) => {
    setThreads((previous) => {
      const thread = previous[conversationId]
      return { ...previous, [conversationId]: thread?.items.length ? thread : { ...EMPTY_THREAD } }
    })
    try {
      const { items, hasMore } = await fetchMessages(conversationId)
      setThreads((previous) => {
        // Keep bubbles that are still sending or failed.
        const local = (previous[conversationId]?.items ?? []).filter((item) => item.pending || item.failed)
        return {
          ...previous,
          [conversationId]: { status: "ready", items: [...items, ...local], hasMore, loadingOlder: false },
        }
      })
    } catch (error) {
      setThreads((previous) => ({
        ...previous,
        [conversationId]: {
          ...(previous[conversationId] ?? EMPTY_THREAD),
          status: "error",
          error: errorMessage(error, "We couldn't load these messages."),
        },
      }))
    }
  }, [])

  const updateUrl = useCallback(
    (conversationId: string | null, push: boolean) => {
      if (embedded || typeof window === "undefined") return
      const url = new URL(window.location.href)
      url.searchParams.delete("listing")
      url.searchParams.delete("draft")
      if (conversationId) url.searchParams.set("conversation", conversationId)
      else url.searchParams.delete("conversation")
      if (url.href === window.location.href) return
      if (push) window.history.pushState({}, "", url)
      else window.history.replaceState({}, "", url)
    },
    [embedded],
  )

  const selectConversation = (conversationId: string | null) => {
    setActiveId(conversationId)
    setNotice(null)
    // On phones the chat is a separate screen, so the browser back button should return to the list.
    updateUrl(conversationId, isMobile)
  }

  // Initial load: the inbox, then the conversation named in the URL (or opened from a listing).
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(embedded ? "" : window.location.search)
    const listingId = params.get("listing")
    // Pre-written message from the listing page (Buy Now or Make Offer).
    const draft = params.get("draft")?.slice(0, MAX_MESSAGE_LENGTH).trim() || ""
    const requestedId = params.get("conversation")
    const phone = window.matchMedia("(max-width: 760px)").matches

    setListState({ status: "loading" })
    ;(async () => {
      let items: Conversation[]
      try {
        items = await fetchConversations()
      } catch (error) {
        if (!cancelled) setListState({ status: "error", error: errorMessage(error, "We couldn't load your messages.") })
        return
      }
      if (cancelled) return
      setConversations(sortConversations(items))
      setListState({ status: "ready" })

      if (listingId) {
        try {
          const conversation = await startConversation(listingId)
          if (cancelled) return
          upsertConversation(conversation)
          setActiveId(conversation.id)
          updateUrl(conversation.id, false)
          if (draft) {
            setDrafts((previous) => ({ ...previous, [conversation.id]: draft }))
          } else if (!conversation.lastMessage) {
            setDrafts((previous) => ({ ...previous, [conversation.id]: previous[conversation.id] || FIRST_MESSAGE }))
          }
        } catch (error) {
          if (cancelled) return
          setNotice(errorMessage(error, "We couldn't open a chat for this listing."))
          updateUrl(null, false)
          if (!phone) setActiveId(items[0]?.id ?? null)
        }
        return
      }

      if (requestedId) {
        if (!items.some((conversation) => conversation.id === requestedId)) {
          try {
            const conversation = await fetchConversation(requestedId)
            if (cancelled) return
            upsertConversation(conversation)
          } catch {
            if (cancelled) return
            setNotice("That conversation couldn't be found.")
            updateUrl(null, false)
            if (!phone) setActiveId(items[0]?.id ?? null)
            return
          }
        }
        setActiveId(requestedId)
        return
      }

      if (!phone) {
        setActiveId(items[0]?.id ?? null)
        updateUrl(items[0]?.id ?? null, false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [embedded, reloadKey, updateUrl, upsertConversation])

  // Phone back button: the URL decides whether the list or a chat is showing.
  useEffect(() => {
    if (embedded) return
    const onPopState = () => {
      if (window.location.pathname !== "/messages") return
      setActiveId(new URLSearchParams(window.location.search).get("conversation"))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [embedded])

  // Load a conversation's history the first time it is opened.
  useEffect(() => {
    if (activeId && !threads[activeId]) void loadThread(activeId)
  }, [activeId, threads, loadThread])

  const loadOffer = useCallback((conversationId: string) => {
    fetchConversationOffer(conversationId)
      .then((offer) => setOffers((previous) => ({ ...previous, [conversationId]: offer })))
      .catch(() => setOffers((previous) => ({ ...previous, [conversationId]: null })))
  }, [])

  // And its current offer, for the deal bar.
  useEffect(() => {
    if (activeId && !(activeId in offers)) loadOffer(activeId)
  }, [activeId, offers, loadOffer])

  const setOffer = useCallback((offer: Offer) => {
    if (offer.status === "replaced") return // a newer offer follows
    setOffers((previous) => ({ ...previous, [offer.conversationId]: offer }))
  }, [])

  const setListingStatus = useCallback((conversationId: string, status: "sold" | "rented") => {
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, listing: { ...conversation.listing, status } } : conversation,
      ),
    )
  }, [])

  // Mark the open conversation read while the tab is visible.
  const activeUnread = activeConversation?.unreadCount ?? 0
  useEffect(() => {
    if (!activeId || activeUnread === 0) return
    const conversationId = activeId
    const markRead = () => {
      if (document.visibilityState !== "visible" || readingRef.current.has(conversationId)) return
      readingRef.current.add(conversationId)
      setConversations((previous) =>
        previous.map((conversation) => (conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation)),
      )
      markConversationRead(conversationId)
        .catch(() => {})
        .finally(() => readingRef.current.delete(conversationId))
    }
    markRead()
    document.addEventListener("visibilitychange", markRead)
    return () => document.removeEventListener("visibilitychange", markRead)
  }, [activeId, activeUnread])

  // Live events.
  useEffect(() => {
    if (!socket) return
    const typingTimers = typingTimersRef.current

    const onMessage = ({ conversation, message, clientId }: MessageNewEvent) => {
      upsertConversation(conversation)
      settleMessage(conversation.id, message, clientId)
      if (message.senderId !== myId) setTyping((previous) => ({ ...previous, [conversation.id]: false }))
    }
    const onRead = ({ conversationId, readerId, readAt }: ConversationReadEvent) => {
      setConversations((previous) =>
        previous.map((conversation) => {
          if (conversation.id !== conversationId) return conversation
          return readerId === myId ? { ...conversation, unreadCount: 0 } : { ...conversation, otherLastReadAt: readAt }
        }),
      )
    }
    const onTyping = ({ conversationId, isTyping }: TypingEvent) => {
      window.clearTimeout(typingTimers.get(conversationId))
      setTyping((previous) => ({ ...previous, [conversationId]: isTyping }))
      if (isTyping) {
        typingTimers.set(
          conversationId,
          window.setTimeout(() => setTyping((previous) => ({ ...previous, [conversationId]: false })), TYPING_DISPLAY_MS),
        )
      }
    }
    // After a dropped connection, catch up on anything missed.
    const onConnect = () => {
      fetchConversations()
        .then((items) => setConversations(sortConversations(items)))
        .catch(() => {})
      if (activeIdRef.current) {
        void loadThread(activeIdRef.current)
        loadOffer(activeIdRef.current)
      }
    }
    const onOffer = ({ offer }: OfferUpdatedEvent) => setOffer(offer)

    socket.on("message:new", onMessage)
    socket.on("conversation:read", onRead)
    socket.on("typing", onTyping)
    socket.on("connect", onConnect)
    socket.on("offer:updated", onOffer)
    return () => {
      socket.off("message:new", onMessage)
      socket.off("conversation:read", onRead)
      socket.off("typing", onTyping)
      socket.off("connect", onConnect)
      socket.off("offer:updated", onOffer)
      typingTimers.forEach((timer) => window.clearTimeout(timer))
      typingTimers.clear()
    }
  }, [socket, myId, upsertConversation, settleMessage, loadThread, loadOffer, setOffer])


  const stopTyping = useCallback(
    (conversationId: string) => {
      window.clearTimeout(typingIdleTimerRef.current)
      if (typingSentRef.current.id !== conversationId) return
      socket?.emit("typing", { conversationId, isTyping: false })
      typingSentRef.current = { id: null, at: 0 }
    },
    [socket],
  )

  // Leaving a conversation (or the page) ends any typing indicator we started.
  useEffect(() => {
    if (!activeId) return
    return () => stopTyping(activeId)
  }, [activeId, stopTyping])

  const changeDraft = (conversationId: string, value: string) => {
    setDrafts((previous) => ({ ...previous, [conversationId]: value }))
    if (!socket) return
    if (!value.trim()) {
      stopTyping(conversationId)
      return
    }
    const now = Date.now()
    if (typingSentRef.current.id !== conversationId || now - typingSentRef.current.at > TYPING_RESEND_MS) {
      socket.emit("typing", { conversationId, isTyping: true })
      typingSentRef.current = { id: conversationId, at: now }
    }
    window.clearTimeout(typingIdleTimerRef.current)
    typingIdleTimerRef.current = window.setTimeout(() => stopTyping(conversationId), TYPING_IDLE_MS)
  }

  const deliver = async (conversationId: string, text: string) => {
    const clientId = newClientId()
    const pending: DisplayMessage = {
      id: clientId,
      clientId,
      conversationId,
      senderId: myId,
      text,
      createdAt: new Date().toISOString(),
      pending: true,
    }
    stickToBottomRef.current = true
    setThreads((previous) => {
      const thread = previous[conversationId] ?? { ...EMPTY_THREAD, status: "ready" as const }
      return { ...previous, [conversationId]: { ...thread, items: [...thread.items, pending] } }
    })
    try {
      const { message, conversation } = await sendMessage(conversationId, text, clientId)
      upsertConversation(conversation)
      settleMessage(conversationId, message, clientId)
    } catch (error) {
      setNotice(errorMessage(error, "Your message wasn't sent."))
      setThreads((previous) => {
        const thread = previous[conversationId]
        if (!thread) return previous
        return {
          ...previous,
          [conversationId]: {
            ...thread,
            items: thread.items.map((item) => (item.clientId === clientId && item.pending ? { ...item, pending: false, failed: true } : item)),
          },
        }
      })
    }
  }

  const send = (conversationId: string, raw: string) => {
    const text = raw.trim()
    if (!text) return
    if (text.length > MAX_MESSAGE_LENGTH) {
      setNotice(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`)
      return
    }
    setNotice(null)
    stopTyping(conversationId)
    void deliver(conversationId, text)
  }

  const submitDraft = (event: FormEvent, conversationId: string) => {
    event.preventDefault()
    const text = drafts[conversationId] ?? ""
    if (!text.trim()) return
    setDrafts((previous) => ({ ...previous, [conversationId]: "" }))
    send(conversationId, text)
  }

  const retry = (conversationId: string, failed: DisplayMessage) => {
    setThreads((previous) => {
      const thread = previous[conversationId]
      if (!thread) return previous
      return { ...previous, [conversationId]: { ...thread, items: thread.items.filter((item) => item.id !== failed.id) } }
    })
    send(conversationId, failed.text)
  }

  const loadOlder = async (conversationId: string) => {
    const thread = threads[conversationId]
    if (!thread || thread.loadingOlder || !thread.hasMore) return
    const oldest = thread.items.find((item) => !item.pending && !item.failed)
    const body = chatBodyRef.current
    if (body) preserveScrollRef.current = { height: body.scrollHeight, top: body.scrollTop }
    setThreads((previous) => ({ ...previous, [conversationId]: { ...previous[conversationId], loadingOlder: true } }))
    try {
      const { items, hasMore } = await fetchMessages(conversationId, oldest?.createdAt)
      setThreads((previous) => {
        const current = previous[conversationId]
        const known = new Set(current.items.map((item) => item.id))
        return {
          ...previous,
          [conversationId]: { ...current, items: [...items.filter((item) => !known.has(item.id)), ...current.items], hasMore, loadingOlder: false },
        }
      })
    } catch (error) {
      preserveScrollRef.current = null
      setNotice(errorMessage(error, "We couldn't load earlier messages."))
      setThreads((previous) => ({ ...previous, [conversationId]: { ...previous[conversationId], loadingOlder: false } }))
    }
  }

  // Keep the newest message in view unless the reader has scrolled up; keep position when loading older ones.
  const activeItemCount = activeThread?.items.length ?? 0
  const activeTyping = activeId ? Boolean(typing[activeId]) : false
  useEffect(() => {
    stickToBottomRef.current = true
  }, [activeId])
  useLayoutEffect(() => {
    const body = chatBodyRef.current
    if (!body) return
    const preserved = preserveScrollRef.current
    if (preserved) {
      preserveScrollRef.current = null
      body.scrollTop = body.scrollHeight - preserved.height + preserved.top
    } else if (stickToBottomRef.current) {
      body.scrollTop = body.scrollHeight
    }
  }, [activeId, activeItemCount, activeTyping, activeThread?.status, isMobile])

  const onChatScroll = () => {
    const body = chatBodyRef.current
    if (body) stickToBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 80
  }

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return conversations
    return conversations.filter(
      (conversation) =>
        conversation.otherUser.name.toLowerCase().includes(term) ||
        conversation.listing.title.toLowerCase().includes(term) ||
        (conversation.lastMessage?.text.toLowerCase().includes(term) ?? false),
    )
  }, [conversations, search])

  const preview = (conversation: Conversation) => {
    if (typing[conversation.id]) return "typing…"
    if (!conversation.lastMessage) return "No messages yet"
    return `${conversation.lastMessage.senderId === myId ? "You: " : ""}${conversation.lastMessage.text}`
  }

  const canViewListing = (conversation: Conversation) =>
    Boolean(conversation.listing.status) && (conversation.role === "seller" || !OWNER_ONLY_STATUSES.has(conversation.listing.status ?? ""))

  const viewListing = (conversation: Conversation) => {
    if (canViewListing(conversation)) go(`/product/${encodeURIComponent(conversation.listing.id)}`)
  }

  /** Delivery state for the newest outgoing message. */
  const deliveryLabel = (conversation: Conversation, message: DisplayMessage) => {
    if (message.pending) return "Sending…"
    if (conversation.otherLastReadAt && new Date(conversation.otherLastReadAt) >= new Date(message.createdAt)) return "Seen"
    return "Sent"
  }

  const renderNotice = () =>
    notice ? (
      <p className="chat-notice" role="alert">
        {notice}
        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
      </p>
    ) : null

  const renderConnection = () =>
    socket && !connected ? <p className="chat-connection" role="status">Reconnecting… new messages will appear when you're back online.</p> : null

  const renderListingImage = (conversation: Conversation, className?: string) =>
    conversation.listing.imageUrl ? (
      <img className={className} src={conversation.listing.imageUrl} alt="" />
    ) : (
      <span className={`chat-listing-noimage ${className ?? ""}`.trim()} aria-hidden="true">{conversation.listing.title.trim()[0]?.toUpperCase() ?? "?"}</span>
    )

  /** Messages with day separators, the typing bubble, and empty/loading states. */
  const renderThread = (conversation: Conversation, mobile: boolean) => {
    const thread = threads[conversation.id]
    if (!thread || (thread.status === "loading" && thread.items.length === 0)) {
      return <p className="chat-empty" role="status">Loading messages…</p>
    }
    if (thread.status === "error" && thread.items.length === 0) {
      return (
        <div className="chat-empty" role="alert">
          <p>{thread.error}</p>
          <button type="button" className="chat-text-button" onClick={() => void loadThread(conversation.id)}>Try again</button>
        </div>
      )
    }

    const lastOutgoing = [...thread.items].reverse().find((item) => item.senderId === myId && !item.failed)
    let previousDay = ""
    const rows = thread.items.map((message) => {
      const day = dayLabel(message.createdAt)
      const separator = day !== previousDay ? (
        <div className={mobile ? "mobile-chat-date" : "chat-day"} key={`day-${message.id}`}>{day}</div>
      ) : null
      previousDay = day
      const outgoing = message.senderId === myId
      const time = timeFormat.format(new Date(message.createdAt))
      const status = message.failed ? (
        <span className="chat-failed">
          Not sent · <button type="button" onClick={() => retry(conversation.id, message)}>Retry</button>
        </span>
      ) : message === lastOutgoing ? (
        <span className="chat-delivery">{deliveryLabel(conversation, message)}</span>
      ) : null

      // Offer steps (offer, counter, accepted…) render as offer cards with their actions.
      if (message.offer) {
        return (
          <div className={`chat-row ${outgoing ? "outgoing" : "incoming"}`} key={message.clientId ?? message.id}>
            {separator}
            <OfferCard
              message={message as DisplayMessage & { offer: NonNullable<ChatMessage["offer"]> }}
              outgoing={outgoing}
              conversation={conversation}
              latest={offers[conversation.id]}
              time={time}
              onOfferChange={setOffer}
              onListingSold={(listingStatus) => setListingStatus(conversation.id, listingStatus)}
            />
          </div>
        )
      }

      const bubble = mobile ? (
        <div className={outgoing ? "mobile-message-row outgoing" : "mobile-message-row incoming"}>
          <div className={`mobile-message-bubble ${outgoing ? "outgoing" : "incoming"}${message.pending ? " is-pending" : ""}`}>
            <span>{message.text}</span>
            <small>{time}</small>
          </div>
        </div>
      ) : (
        <div className={`${outgoing ? "bubble" : "offer-message"} chat-message${message.pending ? " is-pending" : ""}`}>
          <span className="chat-message-text">{message.text}</span>
          <small className="chat-time">{time}</small>
        </div>
      )
      return (
        <div className={`chat-row ${outgoing ? "outgoing" : "incoming"}`} key={message.clientId ?? message.id}>
          {separator}
          {bubble}
          {status && <div className="chat-status">{status}</div>}
        </div>
      )
    })

    return (
      <>
        {thread.hasMore && (
          <button type="button" className="chat-load-older" onClick={() => void loadOlder(conversation.id)} disabled={thread.loadingOlder}>
            {thread.loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {thread.items.length === 0 && (
          <p className="chat-empty">
            {conversation.role === "buyer"
              ? `Say hello to ${conversation.otherUser.name.split(" ")[0]} — ask about the item or arrange a campus meetup.`
              : "No messages yet."}
          </p>
        )}
        {rows}
        {typing[conversation.id] && (
          <div className={mobile ? "mobile-message-row incoming" : "chat-row incoming"}>
            <div className={mobile ? "mobile-message-bubble incoming chat-typing" : "offer-message chat-typing"} aria-live="polite">
              {conversation.otherUser.name.split(" ")[0]} is typing…
            </div>
          </div>
        )}
        {conversation.role === "buyer" && thread.status === "ready" && thread.items.length === 0 && (
          <div className={mobile ? "message-suggestions mobile-message-suggestions" : "message-suggestions"} aria-label="Quick replies">
            {QUICK_REPLIES.map((reply) => (
              <button key={reply} type="button" className="message-suggestion" onClick={() => send(conversation.id, reply)}>
                {reply}
              </button>
            ))}
          </div>
        )}
      </>
    )
  }

  const canOffer = (conversation: Conversation) =>
    conversation.role === "buyer" && (conversation.listing.status === "active" || conversation.listing.status === "pending")

  const renderReply = (conversation: Conversation, mobile: boolean) => (
    <>
      {offerComposerFor === conversation.id && (
        <OfferComposer conversation={conversation} onOfferChange={setOffer} onClose={() => setOfferComposerFor(null)} />
      )}
    <form className={mobile ? "reply mobile-reply" : "reply"} onSubmit={(event) => submitDraft(event, conversation.id)}>
      {canOffer(conversation) && (
        <button
          type="button"
          className="oc-offer-button"
          onClick={() => setOfferComposerFor((current) => (current === conversation.id ? null : conversation.id))}
          aria-expanded={offerComposerFor === conversation.id}
          title="Make an offer"
        >
          ₹ Offer
        </button>
      )}
      <input
        value={drafts[conversation.id] ?? ""}
        onChange={(event) => changeDraft(conversation.id, event.target.value)}
        placeholder={mobile ? "Type a message" : `Message ${conversation.otherUser.name.split(" ")[0]}…`}
        maxLength={MAX_MESSAGE_LENGTH}
        aria-label="Message"
      />
      <button className="dark" type="submit" disabled={!(drafts[conversation.id] ?? "").trim()}>
        {!mobile && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        )}
        Send
      </button>
    </form>
    </>
  )

  const renderInboxEmpty = () => (
    <div className="chat-inbox-empty">
      <h3>No conversations yet</h3>
      <p>Find something you like on the marketplace and message the seller. Buyers' messages about your listings show up here too.</p>
      <button type="button" className="primary" onClick={() => go("/marketplace")}>Browse the marketplace</button>
    </div>
  )

  const renderListState = () => {
    if (listState.status === "loading") return <p className="chat-empty" role="status">Loading conversations…</p>
    if (listState.status === "error") {
      return (
        <div className="chat-empty" role="alert">
          <p>{listState.error}</p>
          <button type="button" className="chat-text-button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
        </div>
      )
    }
    return null
  }

  const roleChip = (conversation: Conversation) => (
    <span className={`chat-role chat-role-${conversation.role}`}>{roleLabel(conversation)}</span>
  )

  const renderDesktop = () => (
    <div className="messages-layout chat-live">
      <aside className="conversations">
        <h2>Conversations</h2>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, items, messages…" aria-label="Search conversations" />
        <div className="chat-conversation-list">
          {renderListState()}
          {listState.status === "ready" && conversations.length === 0 && <p className="chat-empty">No conversations yet.</p>}
          {listState.status === "ready" && conversations.length > 0 && filteredConversations.length === 0 && (
            <p className="chat-empty">No conversations match “{search}”.</p>
          )}
          {filteredConversations.map((conversation) => (
            <button
              type="button"
              className={`conversation chat-conversation${conversation.id === activeId ? " active" : ""}`}
              key={conversation.id}
              onClick={() => selectConversation(conversation.id)}
              aria-current={conversation.id === activeId ? "true" : undefined}
            >
              <Avatar src={conversation.otherUser.avatarUrl} name={conversation.otherUser.name} />
              <div className="chat-conversation-copy">
                <div className="chat-conversation-top">
                  <strong>{conversation.otherUser.name}</strong>
                  <span>{listTime(conversation.lastMessageAt ?? conversation.createdAt)}</span>
                </div>
                <small>{conversation.listing.title}</small>
                <div className="chat-conversation-bottom">
                  <p className={typing[conversation.id] ? "is-typing" : undefined}>{preview(conversation)}</p>
                  {conversation.unreadCount > 0 && <span className="mobile-unread-badge" aria-label={`${conversation.unreadCount} unread`}>{conversation.unreadCount}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>
      <section className="chat">
        {activeConversation ? (
          <>
            <div className="chat-head">
              <Avatar src={activeConversation.otherUser.avatarUrl} name={activeConversation.otherUser.name} />
              <div>
                <h2>{activeConversation.otherUser.name} {roleChip(activeConversation)}</h2>
                <p className={activeTyping ? "chat-head-typing" : "verified"}>
                  {activeTyping ? "typing…" : `Verified student · ${otherSubtitle(activeConversation)}`}
                </p>
              </div>
            </div>
            <div className="item-strip">
              {renderListingImage(activeConversation)}
              <div>
                <strong>{activeConversation.listing.title}</strong>
                <p>{listingMeta(activeConversation)}</p>
              </div>
              {canViewListing(activeConversation) && <button type="button" onClick={() => viewListing(activeConversation)}>View Item</button>}
            </div>
            {renderConnection()}
            {renderNotice()}
            <div className="chat-body" ref={chatBodyRef} onScroll={onChatScroll}>
              {renderThread(activeConversation, false)}
            </div>
            {renderReply(activeConversation, false)}
          </>
        ) : listState.status === "ready" && conversations.length === 0 ? (
          <>
            {renderNotice()}
            {renderInboxEmpty()}
          </>
        ) : (
          <>
            {renderNotice()}
            {listState.status === "ready" && <p className="chat-empty">Choose a conversation.</p>}
          </>
        )}
      </section>
    </div>
  )

  const renderMobileList = () => (
    <div className="mobile-messages-shell">
      <header className="mobile-messages-header">
        <div>
          <h1>Messages</h1>
        </div>
      </header>
      {renderConnection()}
      {renderNotice()}
      <div className="mobile-conversation-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l5 5" />
        </svg>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" aria-label="Search conversations" />
      </div>
      <div className="mobile-conversation-list">
        {renderListState()}
        {listState.status === "ready" && conversations.length === 0 && renderInboxEmpty()}
        {listState.status === "ready" && conversations.length > 0 && filteredConversations.length === 0 && (
          <div className="mobile-empty-state">
            <h3>No matches</h3>
            <p>No conversations match “{search}”.</p>
          </div>
        )}
        {filteredConversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            className={conversation.id === activeId ? "mobile-conversation-item active" : "mobile-conversation-item"}
            onClick={() => selectConversation(conversation.id)}
          >
            <div className="mobile-contact-wrap">
              <div className="mobile-avatar-wrapper">
                <Avatar src={conversation.otherUser.avatarUrl} name={conversation.otherUser.name} />
              </div>
              <div className="mobile-conversation-copy">
                <div className="mobile-conversation-topline">
                  <strong>{conversation.otherUser.name}</strong>
                  <span>{listTime(conversation.lastMessageAt ?? conversation.createdAt)}</span>
                </div>
                <small className="chat-mobile-listing">{conversation.listing.title}</small>
                <div className="mobile-conversation-meta">
                  <p className={typing[conversation.id] ? "is-typing" : undefined}>{preview(conversation)}</p>
                  {conversation.unreadCount > 0 && <span className="mobile-unread-badge">{conversation.unreadCount}</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const renderMobileChat = () => {
    if (!activeConversation) {
      return (
        <div className="mobile-chat-shell chat-live">
          <header className="mobile-chat-header">
            <button type="button" className="mobile-back-button" onClick={() => selectConversation(null)} aria-label="Back to messages">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </header>
          {renderNotice()}
          {renderListState() ?? <p className="chat-empty" role="status">Opening conversation…</p>}
        </div>
      )
    }

    return (
      <div className="mobile-chat-shell chat-live">
        <header className="mobile-chat-header">
          <button type="button" className="mobile-back-button" onClick={() => selectConversation(null)} aria-label="Back to messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <Avatar src={activeConversation.otherUser.avatarUrl} name={activeConversation.otherUser.name} />
          <div className="mobile-chat-header-copy">
            <strong>{activeConversation.otherUser.name}</strong>
            <span>{activeTyping ? "typing…" : otherSubtitle(activeConversation)}</span>
          </div>
          {canViewListing(activeConversation) && (
            <button type="button" className="mobile-chat-cta" onClick={() => viewListing(activeConversation)}>Item</button>
          )}
        </header>

        <div className="mobile-product-strip">
          {renderListingImage(activeConversation)}
          <div>
            <strong>{activeConversation.listing.title}</strong>
            <span>{[roleLabel(activeConversation), listingMeta(activeConversation)].filter(Boolean).join(" · ")}</span>
          </div>
        </div>

        {renderConnection()}
        {renderNotice()}
        <div className="chat-body mobile-chat-body" ref={chatBodyRef} onScroll={onChatScroll}>
          {renderThread(activeConversation, true)}
        </div>
        {renderReply(activeConversation, true)}
      </div>
    )
  }

  return (
    <main className="page-shell">
      <div className="breadcrumb">
        <button onClick={() => go("/marketplace")}>Campus Direct</button> /{" "}
        <strong>Offers &amp; Messages</strong>
        <span className="verified push">
          ● Designated Campus Safe-Exchange Hub: Tresidder &amp; Old Union
        </span>
      </div>

      {isMobile ? (
        <div className="mobile-messages-container">{activeId ? renderMobileChat() : renderMobileList()}</div>
      ) : (
        renderDesktop()
      )}
    </main>
  )
}
