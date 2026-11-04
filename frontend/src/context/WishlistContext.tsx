import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { fetchWishlistIds, removeFromWishlist, saveToWishlist } from "../lib/wishlist"
import { useAuth } from "./AuthContext"

/** What happened when a heart was clicked. "sign-in" means nobody is signed in yet. */
export type WishlistToggleResult = "saved" | "removed" | "sign-in" | "error"

type WishlistValue = {
  savedIds: ReadonlySet<string>
  count: number
  isSaved: (listingId: string) => boolean
  toggle: (listingId: string) => Promise<WishlistToggleResult>
  /** Message from the last failed save or remove, for the page to show. */
  error: string
  clearError: () => void
}

const WishlistContext = createContext<WishlistValue | null>(null)

/** The signed-in student's saved listings, stored in MongoDB and shared by every heart in the app. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const userId = status === "ready" ? user?.id : undefined
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState("")
  const pending = useRef(new Set<string>())

  useEffect(() => {
    setSavedIds(new Set())
    if (!userId) return
    let cancelled = false
    fetchWishlistIds()
      .then((ids) => { if (!cancelled) setSavedIds(new Set(ids)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  const toggle = useCallback(
    async (listingId: string): Promise<WishlistToggleResult> => {
      if (!userId) return "sign-in"
      if (pending.current.has(listingId)) return savedIds.has(listingId) ? "saved" : "removed"
      const willSave = !savedIds.has(listingId)
      const apply = (save: boolean) =>
        setSavedIds((previous) => {
          const next = new Set(previous)
          if (save) next.add(listingId)
          else next.delete(listingId)
          return next
        })

      pending.current.add(listingId)
      apply(willSave) // optimistic
      setError("")
      try {
        if (willSave) await saveToWishlist(listingId)
        else await removeFromWishlist(listingId)
        return willSave ? "saved" : "removed"
      } catch (cause) {
        apply(!willSave)
        setError(cause instanceof Error ? cause.message : "We couldn't update your wishlist.")
        return "error"
      } finally {
        pending.current.delete(listingId)
      }
    },
    [userId, savedIds],
  )

  const isSaved = useCallback((listingId: string) => savedIds.has(listingId), [savedIds])
  const clearError = useCallback(() => setError(""), [])

  const value = useMemo(
    () => ({ savedIds, count: savedIds.size, isSaved, toggle, error, clearError }),
    [savedIds, isSaved, toggle, error, clearError],
  )
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const value = useContext(WishlistContext)
  if (!value) throw new Error("useWishlist must be used inside WishlistProvider")
  return value
}
