import { useState, type FormEvent, type ReactNode } from "react"
import { formatInr, updateListingStatus } from "../lib/listings"
import { createOffer, respondToOffer, type Offer, type OfferAction } from "../lib/offers"
import type { ChatMessage, Conversation, OfferEvent } from "../types/chat"

const LABELS: Record<OfferEvent, { incoming: string; outgoing: string; icon: ReactNode; tone: "offer" | "counter" | "done" | "closed" }> = {
  offer: { incoming: "Offer received", outgoing: "Offer made", icon: <TagIcon />, tone: "offer" },
  counter: { incoming: "Counter offer", outgoing: "Counter offer", icon: <SwapIcon />, tone: "counter" },
  accepted: { incoming: "Offer accepted", outgoing: "Offer accepted", icon: <CheckIcon />, tone: "done" },
  counter_accepted: { incoming: "Counter accepted", outgoing: "Counter accepted", icon: <CheckIcon />, tone: "done" },
  rejected: { incoming: "Offer declined", outgoing: "Offer declined", icon: <CrossIcon />, tone: "closed" },
  withdrawn: { incoming: "Offer withdrawn", outgoing: "Offer withdrawn", icon: <CrossIcon />, tone: "closed" },
  counter_declined: { incoming: "Counter declined", outgoing: "Counter declined", icon: <CrossIcon />, tone: "closed" },
}

type CardProps = {
  message: ChatMessage & { offer: NonNullable<ChatMessage["offer"]> }
  outgoing: boolean
  conversation: Conversation
  /** The latest offer in this conversation (undefined while loading). Only the card for it shows actions. */
  latest: Offer | null | undefined
  time: string
  onOfferChange: (offer: Offer) => void
  onListingSold: (status: "sold" | "rented") => void
}

/** An offer step shown as a card in the chat, with the actions that apply right now. */
export function OfferCard({ message, outgoing, conversation, latest, time, onOfferChange, onListingSold }: CardProps) {
  const [mode, setMode] = useState<"idle" | "offer" | "counter">("idle")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const { event, amount, note } = message.offer
  const meta = LABELS[event] ?? LABELS.offer
  const isSeller = conversation.role === "seller"
  const listingOpen = conversation.listing.status === "active" || conversation.listing.status === "pending"
  const isRental = conversation.listing.listingType === "for_rent"
  const current = latest && latest.id === message.offer.id ? latest : null

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await task()
      setMode("idle")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }
  const act = (action: OfferAction, value?: number) => {
    if (!current) return
    void run(async () => onOfferChange(await respondToOffer(current.id, action, value)))
  }
  const newOffer = (value: number) => void run(async () => onOfferChange(await createOffer(conversation.id, value)))
  const markDone = () => {
    const status = isRental ? "rented" : "sold"
    if (!window.confirm(`Mark "${conversation.listing.title}" as ${status}? It will be hidden from the marketplace.`)) return
    void run(async () => {
      await updateListingStatus(conversation.listing.id, status)
      onListingSold(status)
    })
  }

  // Actions only on the card for the offer's current step.
  let actions: ReactNode = null
  let actionsOutside = false
  if (current && event === "offer" && current.status === "pending") {
    if (isSeller) {
      actions = (
        <>
          <button type="button" className="oc-btn oc-btn-ghost" disabled={busy} onClick={() => act("reject")}>Decline</button>
          <button type="button" className="oc-btn oc-btn-outline" disabled={busy} onClick={() => setMode("counter")}><ChatIcon /> Counter</button>
          <button type="button" className="oc-btn oc-btn-solid" disabled={busy} onClick={() => act("accept")}><CheckIcon /> Accept</button>
        </>
      )
    } else {
      actionsOutside = true
      actions = (
        <>
          <button type="button" className="oc-btn oc-btn-outline" disabled={busy || !listingOpen} onClick={() => setMode("offer")}><PencilIcon /> Edit</button>
          <button type="button" className="oc-btn oc-btn-outline" disabled={busy} onClick={() => { if (window.confirm("Withdraw this offer?")) act("withdraw") }}><TrashIcon /> Delete</button>
        </>
      )
    }
  } else if (current && event === "counter" && current.status === "countered" && !isSeller) {
    actions = (
      <>
        <button type="button" className="oc-btn oc-btn-outline" disabled={busy || !listingOpen} onClick={() => setMode("offer")}><ChatIcon /> Negotiate</button>
        <button type="button" className="oc-btn oc-btn-solid" disabled={busy || !listingOpen} onClick={() => act("accept")}><CheckIcon /> Accept</button>
      </>
    )
  } else if (current && (event === "accepted" || event === "counter_accepted") && current.status === "accepted" && isSeller && listingOpen) {
    actions = <button type="button" className="oc-btn oc-btn-solid" disabled={busy} onClick={markDone}><CheckIcon /> Mark {isRental ? "rented" : "sold"}</button>
  } else if (current && meta.tone === "closed" && !isSeller && listingOpen) {
    actions = <button type="button" className="oc-btn oc-btn-outline" disabled={busy} onClick={() => setMode("offer")}><TagIcon /> Make a new offer</button>
  }

  // A short line explaining where things stand, for cards that are no longer the latest step.
  let state = ""
  if ((event === "offer" || event === "counter") && !actions) {
    if (!latest) state = ""
    else if (!current) state = "Replaced by a newer offer"
    else if (current.status === "pending" && isSeller === false && event === "counter") state = ""
    else if (current.status === "pending") state = isSeller ? "" : `Waiting for ${conversation.otherUser.name.split(" ")[0]}`
    else if (current.status === "countered") state = event === "offer" ? "Countered" : `Waiting for ${conversation.otherUser.name.split(" ")[0]}`
  }
  if ((event === "accepted" || event === "counter_accepted") && !actions) {
    state = conversation.listing.status === "sold" || conversation.listing.status === "rented"
      ? `Deal done · marked ${conversation.listing.status}`
      : "Deal agreed · arrange the pickup in chat"
  }

  const muted = meta.tone === "closed" || state === "Replaced by a newer offer"
  const form = mode !== "idle" && (
    <AmountForm
      label={mode === "counter" ? "Your counteroffer" : "Your new offer"}
      submitLabel={mode === "counter" ? "Send counter" : "Send offer"}
      placeholder={String(amount)}
      busy={busy}
      onCancel={() => { setMode("idle"); setError("") }}
      onSubmit={(value) => (mode === "counter" ? act("counter", value) : newOffer(value))}
    />
  )

  return (
    <div className={`oc-wrap ${outgoing ? "oc-out" : "oc-in"}`}>
      <div className={`oc oc-${meta.tone}${muted ? " oc-muted" : ""}`}>
        <div className="oc-head">
          <span className="oc-icon" aria-hidden="true">{meta.icon}</span>
          {outgoing ? meta.outgoing : meta.incoming}
        </div>
        <div className="oc-body">
          <strong className="oc-amount">{formatInr(amount)}</strong>
          <span className="oc-for"><small>For</small>{conversation.listing.title}</span>
        </div>
        {note && <p className="oc-note">“{note}”</p>}
        {state && <p className="oc-state">{state}</p>}
        {!actionsOutside && actions && mode === "idle" && <div className="oc-actions">{actions}</div>}
        {!actionsOutside && form}
        {!actionsOutside && error && <p className="oc-error" role="alert">{error}</p>}
      </div>
      <div className="oc-foot">
        {actionsOutside && actions && mode === "idle" && <div className="oc-actions oc-actions-outside">{actions}</div>}
        <small className="oc-time">{time}</small>
      </div>
      {actionsOutside && form && <div className="oc oc-form-only">{form}</div>}
      {actionsOutside && error && <p className="oc-error" role="alert">{error}</p>}
    </div>
  )
}

/** "₹ Offer" next to Send, for buyers: make an offer without leaving the chat. */
export function OfferComposer({ conversation, onOfferChange, onClose }: {
  conversation: Conversation
  onOfferChange: (offer: Offer) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const submit = async (value: number) => {
    setBusy(true)
    setError("")
    try {
      onOfferChange(await createOffer(conversation.id, value))
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't send your offer.")
      setBusy(false)
    }
  }
  return (
    <div className="oc-composer">
      <AmountForm label={`Offer for ${conversation.listing.title}`} submitLabel="Send offer" placeholder="" busy={busy} onCancel={onClose} onSubmit={(value) => void submit(value)} />
      {error && <p className="oc-error" role="alert">{error}</p>}
    </div>
  )
}

function AmountForm({ label, submitLabel, placeholder, busy, onSubmit, onCancel }: {
  label: string
  submitLabel: string
  placeholder: string
  busy: boolean
  onSubmit: (amount: number) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState("")
  const [error, setError] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (!amount.trim() || !Number.isInteger(value) || value <= 0) return setError("Enter a whole number of rupees.")
    if (value > 10_000_000) return setError("That amount is too high.")
    onSubmit(value)
  }
  return (
    <form className="oc-form" onSubmit={submit} noValidate>
      <label>
        <span>{label}</span>
        <span className="pdp-offer-input">
          <span aria-hidden="true">₹</span>
          <input type="number" inputMode="numeric" min={1} step={1} value={amount} placeholder={placeholder} onChange={(event) => { setAmount(event.target.value); setError("") }} autoFocus aria-label={label} />
        </span>
      </label>
      <div className="oc-actions">
        <button type="button" className="oc-btn oc-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="oc-btn oc-btn-solid" disabled={busy}>{busy ? "Sending…" : submitLabel}</button>
      </div>
      {error && <p className="oc-error" role="alert">{error}</p>}
    </form>
  )
}

function Svg({ children }: { children: ReactNode }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}
function TagIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 12.6V4a1 1 0 0 1 1-1h8.6a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-8.6 8.6a1 1 0 0 1-1.4 0l-7.4-7.4a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.6" fill="#fff" /></svg>
}
function SwapIcon() {
  return <Svg><path d="M17 3l4 4-4 4" /><path d="M3 7h18" /><path d="M7 21l-4-4 4-4" /><path d="M21 17H3" /></Svg>
}
function CheckIcon() {
  return <Svg><path d="M20 6L9 17l-5-5" /></Svg>
}
function CrossIcon() {
  return <Svg><path d="M18 6L6 18M6 6l12 12" /></Svg>
}
function ChatIcon() {
  return <Svg><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" /></Svg>
}
function PencilIcon() {
  return <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
}
function TrashIcon() {
  return <Svg><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></Svg>
}
