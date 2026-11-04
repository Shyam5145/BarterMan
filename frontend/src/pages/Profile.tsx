import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Avatar } from "../components/Avatar"
import { useAuth } from "../context/AuthContext"
import { useRealtime } from "../context/RealtimeContext"
import { useWishlist } from "../context/WishlistContext"
import { collegeForEmail } from "../lib/email-domains"
import { fetchMyListings, formatListingPrice, primaryImageUrl, statusLabel } from "../lib/listings"
import type { Listing, ListingStatus } from "../types/listing"
import { YEAR_OPTIONS } from "../types/user"

type ProfileRoute = "/marketplace" | "/seller-hub" | "/messages" | `/product/${string}`

const COMPLETED_STATUSES: ListingStatus[] = ["sold", "rented"]

const LISTING_FILTERS: Array<{ id: string; label: string; matches: (listing: Listing) => boolean }> = [
  { id: "all", label: "All", matches: () => true },
  { id: "active", label: "Active", matches: (listing) => listing.status === "active" || listing.status === "pending" },
  { id: "drafts", label: "Drafts", matches: (listing) => listing.status === "draft" },
  { id: "completed", label: "Completed", matches: (listing) => COMPLETED_STATUSES.includes(listing.status) },
  { id: "archived", label: "Archived", matches: (listing) => listing.status === "archived" },
]

const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" })

const PROVIDER_LABELS: Record<string, string> = {
  "google.com": "Google",
  password: "Email & password",
}

/** The signed-in student's own profile: details, activity, listings, and account. */
export default function Profile({ go, navigate }: { go: (route: ProfileRoute) => void; navigate: (href: string) => void }) {
  const { user, firebaseUser, saveProfile, signOut, collegesByDomain } = useAuth()
  const wishlist = useWishlist()
  const { unreadTotal } = useRealtime()

  const [listings, setListings] = useState<Listing[]>([])
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading")
  const [listError, setListError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [filterId, setFilterId] = useState("all")
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setListState("loading")
    fetchMyListings()
      .then((items) => {
        if (cancelled) return
        setListings(items)
        setListState("ready")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setListError(error instanceof Error ? error.message : "We couldn't load your listings.")
        setListState("error")
      })
    return () => { cancelled = true }
  }, [reloadKey])

  const filter = LISTING_FILTERS.find((item) => item.id === filterId) ?? LISTING_FILTERS[0]
  const visibleListings = useMemo(() => listings.filter(filter.matches), [listings, filter])
  const counts = useMemo(
    () => Object.fromEntries(LISTING_FILTERS.map((item) => [item.id, listings.filter(item.matches).length])),
    [listings],
  )

  if (!user) return null

  const emailCollege = collegeForEmail(user.email, collegesByDomain)
  const college = emailCollege || user.college
  const studyLine = [user.course, user.year].filter(Boolean).join(" · ")
  const providers = (firebaseUser?.providerData ?? []).map((provider) => PROVIDER_LABELS[provider.providerId] ?? provider.providerId)
  const statsReady = listState === "ready"

  const stats = [
    { label: "Active listings", value: statsReady ? counts.active : "–", onClick: () => setFilterId("active") },
    { label: "Completed deals", value: statsReady ? counts.completed : "–", onClick: () => setFilterId("completed") },
    { label: "Wishlist", value: wishlist.count, onClick: () => go("/marketplace") },
    { label: "Unread messages", value: unreadTotal, onClick: () => go("/messages") },
  ]

  return (
    <main className="page-shell pf">
      <section className="pf-card pf-header">
        <Avatar className="pf-avatar" src={user.avatarUrl} name={user.name} alt={user.name} />
        <div className="pf-identity">
          <div className="pf-name-line">
            <h1>{user.name}</h1>
            <span className="pf-verified">✓ Verified student</span>
          </div>
          <p className="pf-college">{college || "College not set"}</p>
          {studyLine && <p className="pf-study">{studyLine}</p>}
          <p className="pf-meta">Member since {monthYear.format(new Date(user.createdAt))}</p>
        </div>
        <div className="pf-header-actions">
          <button type="button" className="secondary" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
            {editing ? "Close" : "Edit profile"}
          </button>
          <button type="button" className="primary" onClick={() => go("/seller-hub")}>Sell an item</button>
        </div>
      </section>

      {editing && (
        <ProfileEditor
          key={user.updatedAt}
          emailCollege={emailCollege}
          initial={{ name: user.name, college: user.college, course: user.course, year: user.year, phone: user.phone }}
          onSave={async (details) => {
            await saveProfile(details)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <section className="pf-stats" aria-label="Your activity">
        {stats.map((stat) => (
          <button type="button" key={stat.label} className="pf-stat" onClick={stat.onClick}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </button>
        ))}
      </section>

      <div className="pf-layout">
        <section className="pf-card pf-listings" aria-labelledby="pf-listings-heading">
          <div className="pf-section-head">
            <div>
              <h2 id="pf-listings-heading">My listings</h2>
              <p>Everything you've listed on campus, including drafts.</p>
            </div>
            <button type="button" className="secondary" onClick={() => go("/seller-hub")}>Manage in Seller Hub</button>
          </div>

          <div className="pf-filters" role="group" aria-label="Filter your listings">
            {LISTING_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === filterId ? "active" : undefined}
                aria-pressed={item.id === filterId}
                onClick={() => setFilterId(item.id)}
              >
                {item.label}
                {statsReady && <span>{counts[item.id]}</span>}
              </button>
            ))}
          </div>

          {listState === "loading" && <p className="pf-empty" role="status">Loading your listings…</p>}
          {listState === "error" && (
            <div className="pf-empty" role="alert">
              <p>{listError}</p>
              <button type="button" className="secondary" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
            </div>
          )}
          {listState === "ready" && visibleListings.length === 0 && (
            <div className="pf-empty">
              <p>{listings.length === 0 ? "You haven't listed anything yet." : `No ${filter.label.toLowerCase()} listings.`}</p>
              {listings.length === 0 && <button type="button" className="primary" onClick={() => go("/seller-hub")}>List your first item</button>}
            </div>
          )}
          {listState === "ready" && visibleListings.length > 0 && (
            <div className="pf-listing-grid">
              {visibleListings.map((listing) => {
                const cover = primaryImageUrl(listing)
                const canView = listing.status !== "draft"
                return (
                  <article className="pf-listing" key={listing.id}>
                    <div className="pf-listing-image">
                      {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="pf-listing-noimage">No photo</span>}
                      <span className={`pf-status pf-status-${listing.status}`}>{statusLabel(listing.status)}</span>
                    </div>
                    <div className="pf-listing-copy">
                      <h3>{listing.title || "Untitled draft"}</h3>
                      <strong>{listing.price !== null || listing.rentalPrice !== null ? formatListingPrice(listing) : "No price yet"}</strong>
                      <small>
                        {listing.category || "No category"} · Updated {shortDate.format(new Date(listing.updatedAt))}
                        {listing.status === "active" && listing.views > 0 && ` · ${listing.views} view${listing.views === 1 ? "" : "s"}`}
                      </small>
                    </div>
                    <div className="pf-listing-actions">
                      <button type="button" onClick={() => navigate(`/seller-hub?edit=${encodeURIComponent(listing.id)}`)}>Edit</button>
                      {canView && <button type="button" onClick={() => go(`/product/${encodeURIComponent(listing.id)}`)}>View</button>}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <aside className="pf-side">
          <section className="pf-card pf-account" aria-labelledby="pf-account-heading">
            <h2 id="pf-account-heading">Account</h2>
            <dl>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Phone</dt><dd>{user.phone || "Not added"}</dd></div>
              <div><dt>College</dt><dd>{college || "Not set"}</dd></div>
              <div><dt>Sign-in</dt><dd>{providers.length ? providers.join(" + ") : "—"}</dd></div>
            </dl>
            <button type="button" className="pf-signout" onClick={() => void signOut()}>Sign out</button>
          </section>
          <p className="pf-privacy">Other students see your name, photo, college, course and year. Your email and phone stay private.</p>
        </aside>
      </div>
    </main>
  )
}

type EditableProfile = { name: string; college: string; course: string; year: string; phone: string }

function ProfileEditor({ initial, emailCollege, onSave, onCancel }: {
  initial: EditableProfile
  emailCollege: string
  onSave: (details: EditableProfile) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const update = (key: keyof EditableProfile, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (!form.name.trim()) return setError("Enter your name.")
    setSaving(true)
    try {
      await onSave({ ...form, name: form.name.trim(), college: emailCollege || form.college })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save your profile.")
      setSaving(false)
    }
  }

  return (
    <form className="pf-card pf-editor profile-form" onSubmit={submit}>
      <h2 className="pf-editor-title">Edit profile</h2>
      <label>Full name<input required value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" /></label>
      <label>
        <span className="profile-label-row">Phone number <span className="optional-label">Optional · private</span></span>
        <input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" placeholder="Add a contact number" />
      </label>
      <label className="profile-field-wide">
        <span className="profile-label-row">College / University {emailCollege && <span className="optional-label">From your college email</span>}</span>
        {emailCollege
          ? <input value={emailCollege} readOnly />
          : <input required value={form.college} onChange={(event) => update("college", event.target.value)} />}
      </label>
      <label>Course / Department<input required value={form.course} onChange={(event) => update("course", event.target.value)} /></label>
      <label>Year of study
        <select required value={form.year} onChange={(event) => update("year", event.target.value)}>
          <option value="" disabled>Select your year</option>
          {YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
        </select>
      </label>
      {error && <p className="auth-error profile-form-error" role="alert">{error}</p>}
      <div className="pf-editor-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  )
}
