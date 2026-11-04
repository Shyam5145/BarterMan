import { apiRequest } from "./api"
import type { Listing, ListingInput, ListingSort, ListingStatus } from "@/types/listing"

// ─── API calls ───

export type ListingQuery = {
  q?: string
  type?: "sale" | "rent"
  category?: string
  sort?: ListingSort
  page?: number
  limit?: number
}

export type ListingPage = { items: Listing[]; total: number; page: number; limit: number; hasMore: boolean }

export function fetchListings(query: ListingQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return apiRequest<ListingPage>(`/listings?${params}`, { auth: false })
}

/** Sends the token when signed in, so owners can also open their drafts. */
export async function fetchListing(id: string) {
  const { listing } = await apiRequest<{ listing: Listing }>(`/listings/${encodeURIComponent(id)}`, { auth: "optional" })
  return listing
}

export async function fetchMyListings() {
  const { items } = await apiRequest<{ items: Listing[] }>("/users/me/listings")
  return items
}

/** A photo in the editor: either already saved (publicId) or a new local file to upload. */
export type EditorPhoto = { publicId?: string; file?: File; isPrimary: boolean }

/**
 * Creates (no id) or updates a listing. Photos are uploaded through the API to Cloudinary in
 * the same request; MongoDB stores only their URLs.
 */
export async function saveListing({ id, input, photos }: { id?: string; input: ListingInput; photos: EditorPhoto[] }) {
  const files: File[] = []
  const images = photos.map((photo) => (photo.file ? { newFileIndex: files.push(photo.file) - 1 } : { publicId: photo.publicId }))
  const primaryIndex = Math.max(0, photos.findIndex((photo) => photo.isPrimary))

  const body = new FormData()
  body.append("data", JSON.stringify({ ...input, images, primaryIndex }))
  files.forEach((file) => body.append("photos", file, file.name))

  const path = id ? `/listings/${encodeURIComponent(id)}` : "/listings"
  const { listing } = await apiRequest<{ listing: Listing }>(path, { method: id ? "PUT" : "POST", body })
  return listing
}

export async function updateListingStatus(id: string, status: Exclude<ListingStatus, "draft">) {
  const { listing } = await apiRequest<{ listing: Listing }>(`/listings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: { status },
  })
  return listing
}

export async function deleteListing(id: string) {
  await apiRequest<null>(`/listings/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ─── Display helpers ───

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })

export function formatInr(value: number | null | undefined) {
  return inr.format(value ?? 0)
}

const RENTAL_SUFFIX: Record<string, string> = {
  "Per day": "/day",
  "Per week": "/week",
  "Per month": "/month",
  Flexible: " (flexible)",
}

export function rentalSuffix(listing: Pick<Listing, "rentalDuration">) {
  return RENTAL_SUFFIX[listing.rentalDuration] ?? ""
}

/** "₹650" for sales, "₹2,400/day" for rentals. */
export function formatListingPrice(listing: Pick<Listing, "listingType" | "price" | "rentalPrice" | "rentalDuration">) {
  return listing.listingType === "for_rent" ? `${formatInr(listing.rentalPrice)}${rentalSuffix(listing)}` : formatInr(listing.price)
}

/** Marketplace card tag, matching the existing "BUY" / "RENT OR BUY" labels. */
export function listingTag(listing: Pick<Listing, "listingType" | "price">) {
  if (listing.listingType === "for_sale") return "BUY"
  return listing.price ? "RENT OR BUY" : "RENT"
}

export function listingTypeLabel(listing: Pick<Listing, "listingType">) {
  return listing.listingType === "for_rent" ? "For Rent" : "For Sale"
}

export function statusLabel(status: ListingStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function primaryImageUrl(listing: Pick<Listing, "images">) {
  return (listing.images.find((image) => image.isPrimary) ?? listing.images[0])?.url ?? ""
}

/** Images with the cover photo first. */
export function orderedImageUrls(listing: Pick<Listing, "images">) {
  const cover = listing.images.find((image) => image.isPrimary)
  return cover ? [cover.url, ...listing.images.filter((image) => image !== cover).map((image) => image.url)] : listing.images.map((image) => image.url)
}
