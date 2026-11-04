import { apiRequest } from "./api"
import type { Listing } from "../types/listing"

export type SavedListing = Listing & { savedAt: string }

export async function fetchWishlistIds() {
  const { ids } = await apiRequest<{ ids: string[] }>("/users/me/wishlist/ids")
  return ids
}

export async function fetchWishlist() {
  const { items } = await apiRequest<{ items: SavedListing[] }>("/users/me/wishlist")
  return items
}

export async function saveToWishlist(listingId: string) {
  await apiRequest(`/users/me/wishlist/${encodeURIComponent(listingId)}`, { method: "PUT" })
}

export async function removeFromWishlist(listingId: string) {
  await apiRequest(`/users/me/wishlist/${encodeURIComponent(listingId)}`, { method: "DELETE" })
}
