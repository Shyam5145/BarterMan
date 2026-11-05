import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Avatar } from "../components/Avatar"
import { fetchReceivedOffers, respondToOffer, type Offer, type OfferStatus } from "../lib/offers"
import { formatInr } from "../lib/listings"

const FILTERS: Array<{ id: OfferStatus | "all"; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "all", label: "All" },
  { id: "accepted", label: "Accepted" },
  { id: "countered", label: "Countered" },
  { id: "rejected", label: "Declined" },
]

const STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  countered: "Countered",
  rejected: "Declined",
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

/**
 * Seller Hub → Offers & Negotiations: real offers buyers made on this seller's listings.
 * Each answer (accept, counter, decline) is also posted in the chat with the buyer.
 */
export default function SellerOffers({ openConversation, onPendingCount }: {
  openConversation: (conversationId: string) => void
  onPendingCount?: (count: number) => void
}) {
  const [filter, setFilter] = useState<OfferStatus | "all">("pending")
  const [offers, setOffers] = useState<Offer[]>([])
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [counteringId, setCounteringId] = useState<string | null>(null)

  // All non-replaced offers are loaded once; the chips filter them here.
  useEffect(() => {
    let cancelled = false
    setState("loading")
    fetchReceivedOffers("all")
      .then(({ items, pendingCount }) => {
        if (cancelled) return
        setOffers(items)
        setState("ready")
        onPendingCount?.(pendingCount)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : "We couldn't load your offers.")
        setState("error")
      })
    return () => { cancelled = true }
  }, [reloadKey, onPendingCount])

  const visible = useMemo(() => (filter === "all" ? offers : offers.filter((offer) => offer.status === filter)), [offers, filter])
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: offers.length }
    for (const offer of offers) result[offer.status] = (result[offer.status] ?? 0) + 1
    return result
  }, [offers])

  const respond = async (offer: Offer, action: "accept" | "reject" | "counter", amount?: number) => {
    if (action === "accept" && !window.confirm(`Accept ${formatInr(offer.amount)} from ${offer.buyer.name} for "${offer.listing.title}"?`)) return
    setBusyId(offer.id)
    setActionError("")
    try {
      const updated = await respondToOffer(offer.id, action, amount)
      setOffers((current) => {
        const next = current.map((item) => (item.id === offer.id ? updated : item))
        onPendingCount?.(next.filter((item) => item.status === "pending").length)
        return next
      })
      setCounteringId(null)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "We couldn't update that offer.")
      if (cause instanceof Error && "status" in cause && cause.status === 409) setReloadKey((key) => key + 1)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="seller-dashboard-section">
      <div className="seller-section-header">
        <div>
          <span className="eyebrow">Deals</span>
          <h1>Offers &amp; Negotiations</h1>
          <p className="so-subtitle">Offers buyers make on your listings. Your reply is sent to them in chat.</p>
        </div>
      </div>

      <div className="seller-toolbar-row">
        <div className="seller-filter-tabs">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
              {state === "ready" && <span className="sh-filter-count">{counts[item.id] ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>

      {actionError && <p className="listing-alert-error" role="alert">{actionError}</p>}

      {state === "loading" && <div className="seller-empty-block" role="status">Loading offers…</div>}
      {state === "error" && (
        <div className="seller-empty-block" role="alert">
          <p>{error}</p>
          <button type="button" className="secondary" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
        </div>
      )}
      {state === "ready" && visible.length === 0 && (
        <div className="so-empty">
          <h3>{offers.length === 0 ? "No offers yet" : `No ${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} offers`}</h3>
          <p>{offers.length === 0
            ? "When a buyer taps Make Offer on one of your listings, it shows up here and in your messages."
            : "Try another filter to see the rest of your offers."}</p>
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <div className="so-list">
          {visible.map((offer) => {
            const busy = busyId === offer.id
            const below = offer.listing.askingPrice ? ` · asking ${offer.listing.askingPrice}` : ""
            return (
              <article key={offer.id} className="so-card">
                <div className="so-listing">
                  {offer.listing.imageUrl
                    ? <img src={offer.listing.imageUrl} alt="" />
                    : <span className="so-listing-noimage" aria-hidden="true">{offer.listing.title.trim()[0]?.toUpperCase() ?? "?"}</span>}
                  <div>
                    <strong>{offer.listing.title}</strong>
                    <span>{offer.listing.status && offer.listing.status !== "active" ? `Listing ${offer.listing.status}` : "Your listing"}{below}</span>
                  </div>
                  <span className={`so-status so-status-${offer.status}`}>{STATUS_LABELS[offer.status]}</span>
                </div>

                <div className="so-main">
                  <div className="so-buyer">
                    <Avatar src={offer.buyer.avatarUrl} name={offer.buyer.name} />
                    <div>
                      <strong>{offer.buyer.name}</strong>
                      <span>{[offer.buyer.course, offer.buyer.year].filter(Boolean).join(" · ") || "Verified student"}</span>
                    </div>
                  </div>
                  <div className="so-amount">
                    <strong>{formatInr(offer.amount)}</strong>
                    <small>Offered {dateFormat.format(new Date(offer.createdAt))}</small>
                  </div>
                </div>

                {offer.note && <p className="so-note">“{offer.note}”</p>}
                {offer.status === "countered" && offer.counterAmount !== null && (
                  <p className="so-outcome">You countered with <strong>{formatInr(offer.counterAmount)}</strong>. Waiting for the buyer to reply in chat.</p>
                )}
                {offer.status === "accepted" && <p className="so-outcome">You accepted this offer. Arrange the pickup in chat, then mark the listing sold.</p>}
                {offer.status === "rejected" && <p className="so-outcome">You declined this offer.</p>}

                {counteringId === offer.id ? (
                  <CounterForm
                    offer={offer}
                    busy={busy}
                    onCancel={() => setCounteringId(null)}
                    onSubmit={(amount) => void respond(offer, "counter", amount)}
                  />
                ) : (
                  <div className="so-actions">
                    {offer.status === "pending" && (
                      <>
                        <button type="button" className="primary" disabled={busy} onClick={() => void respond(offer, "accept")}>Accept</button>
                        <button type="button" className="secondary" disabled={busy} onClick={() => setCounteringId(offer.id)}>Counteroffer</button>
                        <button type="button" className="so-decline" disabled={busy} onClick={() => void respond(offer, "reject")}>Decline</button>
                      </>
                    )}
                    <button type="button" className="so-chat" onClick={() => openConversation(offer.conversationId)}>Open chat →</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CounterForm({ offer, busy, onSubmit, onCancel }: { offer: Offer; busy: boolean; onSubmit: (amount: number) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("")
  const [error, setError] = useState("")

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (!amount.trim() || !Number.isInteger(value) || value <= 0) return setError("Enter a whole number of rupees.")
    onSubmit(value)
  }

  return (
    <form className="so-counter" onSubmit={submit} noValidate>
      <label htmlFor={`counter-${offer.id}`}>Your counteroffer</label>
      <div className="pdp-offer-input">
        <span aria-hidden="true">₹</span>
        <input
          id={`counter-${offer.id}`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={amount}
          placeholder={String(offer.amount)}
          onChange={(event) => { setAmount(event.target.value); setError("") }}
          autoFocus
        />
      </div>
      {error && <p className="pdp-offer-error" role="alert">{error}</p>}
      <div className="so-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Sending…" : "Send counteroffer"}</button>
      </div>
    </form>
  )
}
