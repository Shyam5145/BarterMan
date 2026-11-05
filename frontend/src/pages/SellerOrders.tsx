import { useEffect, useMemo, useState } from "react"
import { Avatar } from "../components/Avatar"
import { formatInr, formatListingPrice, primaryImageUrl } from "../lib/listings"
import { fetchReceivedOffers, type Offer } from "../lib/offers"
import type { Listing, ListingStatus } from "../types/listing"

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })

/**
 * Seller Hub → Orders & Rentals, built from real data:
 * - In progress: offers the seller accepted on listings that aren't marked sold/rented yet
 * - Sales / Rentals: the seller's listings marked sold or rented (with the agreed price and buyer when known)
 */
export default function SellerOrders({ listings, listingsState, busyListingId, onChangeStatus, openConversation, viewListing, onBrowseListings }: {
  listings: Listing[]
  listingsState: "loading" | "ready" | "error"
  busyListingId: string | null
  onChangeStatus: (listingId: string, status: Exclude<ListingStatus, "draft">) => Promise<void>
  openConversation: (conversationId: string) => void
  viewListing: (listingId: string) => void
  onBrowseListings: () => void
}) {
  const [accepted, setAccepted] = useState<Offer[]>([])
  const [offersState, setOffersState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    fetchReceivedOffers("accepted")
      .then(({ items }) => {
        if (cancelled) return
        setAccepted(items)
        setOffersState("ready")
      })
      .catch(() => { if (!cancelled) setOffersState("error") })
    return () => { cancelled = true }
  }, [])

  // The latest accepted offer per listing tells us the buyer and agreed price.
  const dealByListing = useMemo(() => {
    const map = new Map<string, Offer>()
    for (const offer of accepted) if (!map.has(offer.listing.id)) map.set(offer.listing.id, offer)
    return map
  }, [accepted])

  const listingById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings])
  const byNewest = (left: Listing, right: Listing) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  const sales = useMemo(() => listings.filter((listing) => listing.status === "sold").sort(byNewest), [listings])
  const rentals = useMemo(() => listings.filter((listing) => listing.status === "rented").sort(byNewest), [listings])
  const inProgress = useMemo(
    () => [...dealByListing.values()].filter((offer) => {
      const listing = listingById.get(offer.listing.id)
      return listing && (listing.status === "active" || listing.status === "pending")
    }),
    [dealByListing, listingById],
  )

  if (listingsState === "loading") return <Shell><div className="seller-empty-block" role="status">Loading your orders…</div></Shell>
  if (listingsState === "error") return <Shell><div className="seller-empty-block" role="alert">We couldn't load your listings. Try again from My Listings.</div></Shell>

  const nothingYet = sales.length === 0 && rentals.length === 0 && inProgress.length === 0

  return (
    <Shell>
      <div className="so-summary">
        <div><strong>{inProgress.length}</strong><span>In progress</span></div>
        <div><strong>{sales.length}</strong><span>Sold</span></div>
        <div><strong>{rentals.length}</strong><span>Rented</span></div>
      </div>

      {nothingYet && offersState !== "loading" && (
        <div className="so-empty">
          <h3>No orders yet</h3>
          <p>When you accept a buyer's offer, or mark one of your listings as sold or rented, it shows up here.</p>
          <button type="button" className="secondary" onClick={onBrowseListings}>Go to My Listings</button>
        </div>
      )}

      {inProgress.length > 0 && (
        <section className="seller-panel orders-section">
          <div className="seller-panel-header">
            <h2>In progress</h2>
            <small className="orders-hint">Offers you accepted. Mark them sold or rented after the handoff.</small>
          </div>
          <div className="orders-list">
            {inProgress.map((offer) => {
              const listing = listingById.get(offer.listing.id)!
              const busy = busyListingId === listing.id
              return (
                <OrderRow key={offer.id} listing={listing} onOpen={() => viewListing(listing.id)}
                  badge={<span className="so-status so-status-pending">Awaiting handoff</span>}
                  detail={<>Agreed <strong>{formatInr(offer.amount)}</strong> with</>}
                  buyer={offer}
                  date={`Accepted ${dateFormat.format(new Date(offer.respondedAt ?? offer.createdAt))}`}
                  actions={
                    <>
                      {listing.listingType === "for_rent"
                        ? <button type="button" className="primary" disabled={busy} onClick={() => void onChangeStatus(listing.id, "rented")}>Mark rented</button>
                        : <button type="button" className="primary" disabled={busy} onClick={() => void onChangeStatus(listing.id, "sold")}>Mark sold</button>}
                      <button type="button" className="so-chat" onClick={() => openConversation(offer.conversationId)}>Open chat →</button>
                    </>
                  }
                />
              )
            })}
          </div>
        </section>
      )}

      {!nothingYet && (
        <div className="seller-two-column-layout">
          <OrdersGroup title="Sales" empty="No sales yet. Mark a listing as sold once it's handed over." items={sales}
            render={(listing) => <CompletedRow key={listing.id} listing={listing} deal={dealByListing.get(listing.id)} label="Sold" busy={busyListingId === listing.id} onChangeStatus={onChangeStatus} openConversation={openConversation} viewListing={viewListing} />} />
          <OrdersGroup title="Rentals" empty="No rentals yet. Mark a rental listing as rented when it's handed over." items={rentals}
            render={(listing) => <CompletedRow key={listing.id} listing={listing} deal={dealByListing.get(listing.id)} label="Rented" busy={busyListingId === listing.id} onChangeStatus={onChangeStatus} openConversation={openConversation} viewListing={viewListing} />} />
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="seller-dashboard-section">
      <div className="seller-section-header">
        <div>
          <span className="eyebrow">Orders</span>
          <h1>Orders &amp; Rentals</h1>
          <p className="so-subtitle">Deals you've agreed on and items you've sold or rented out.</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function OrdersGroup({ title, empty, items, render }: { title: string; empty: string; items: Listing[]; render: (listing: Listing) => React.ReactNode }) {
  return (
    <section className="seller-panel orders-section">
      <div className="seller-panel-header">
        <h2>{title} <span className="orders-count">{items.length}</span></h2>
      </div>
      {items.length ? <div className="orders-list">{items.map(render)}</div> : <div className="seller-empty-block">{empty}</div>}
    </section>
  )
}

function CompletedRow({ listing, deal, label, busy, onChangeStatus, openConversation, viewListing }: {
  listing: Listing
  deal?: Offer
  label: string
  busy: boolean
  onChangeStatus: (listingId: string, status: Exclude<ListingStatus, "draft">) => Promise<void>
  openConversation: (conversationId: string) => void
  viewListing: (listingId: string) => void
}) {
  return (
    <OrderRow listing={listing} onOpen={() => viewListing(listing.id)}
      badge={<span className="so-status so-status-accepted">{label}</span>}
      detail={deal ? <>For <strong>{formatInr(deal.amount)}</strong> to</> : <>Listed at <strong>{formatListingPrice(listing)}</strong></>}
      buyer={deal}
      date={`${label} ${dateFormat.format(new Date(listing.updatedAt))}`}
      actions={
        <>
          <button type="button" className="secondary" disabled={busy} onClick={() => void onChangeStatus(listing.id, "active")}>Relist</button>
          {deal && <button type="button" className="so-chat" onClick={() => openConversation(deal.conversationId)}>Open chat →</button>}
        </>
      }
    />
  )
}

function OrderRow({ listing, badge, detail, buyer, date, actions, onOpen }: {
  listing: Listing
  badge: React.ReactNode
  detail: React.ReactNode
  buyer?: Offer
  date: string
  actions: React.ReactNode
  onOpen: () => void
}) {
  const cover = primaryImageUrl(listing)
  return (
    <article className="orders-row">
      <button type="button" className="orders-row-main" onClick={onOpen}>
        {cover ? <img src={cover} alt="" /> : <span className="so-listing-noimage" aria-hidden="true">{listing.title.trim()[0]?.toUpperCase() ?? "?"}</span>}
        <div>
          <strong>{listing.title}</strong>
          <span className="orders-detail">
            {detail}
            {buyer && (
              <span className="orders-buyer">
                <Avatar src={buyer.buyer.avatarUrl} name={buyer.buyer.name} />
                {buyer.buyer.name}
              </span>
            )}
          </span>
          <small>{date}</small>
        </div>
        {badge}
      </button>
      <div className="so-actions">{actions}</div>
    </article>
  )
}
