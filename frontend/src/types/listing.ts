// Option lists shared with the server's Listing model.
export const LISTING_CATEGORIES = [
  "Electronics",
  "Books & Study Materials",
  "Furniture",
  "Fashion",
  "Cycles & Vehicles",
  "Sports & Fitness",
  "Home & Dorm Essentials",
  "Other",
] as const
export const LISTING_CONDITIONS = ["Like New", "Very Good", "Good", "Fair"] as const
export const RENTAL_DURATIONS = ["Per day", "Per week", "Per month", "Flexible"] as const

export type ListingType = "for_sale" | "for_rent"
export type ListingStatus = "active" | "draft" | "pending" | "sold" | "rented" | "archived"
export type ListingSort = "newest" | "price_asc" | "price_desc"

/** A photo stored in Cloudinary; MongoDB keeps only its URL and public ID. */
export type ListingImage = {
  url: string
  publicId: string
  width?: number
  height?: number
  isPrimary: boolean
}

export type ListingSeller = {
  id: string
  name: string
  avatarUrl: string
  college: string
  course: string
  year: string
}

export type Listing = {
  id: string
  title: string
  description: string
  category: string
  condition: string
  listingType: ListingType
  price: number | null
  rentalPrice: number | null
  rentalDuration: string
  availability: string
  exchangeFor: string
  campus: string
  pickupLocation: string
  pickupInstructions: string
  images: ListingImage[]
  status: ListingStatus
  views: number
  seller: ListingSeller
  isOwner: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Listing fields sent when creating or updating (campus is set by the server from the profile). */
export type ListingInput = {
  title: string
  description: string
  category: string
  condition: string
  listingType: ListingType
  price: number | null
  rentalPrice: number | null
  rentalDuration: string
  availability: string
  exchangeFor: string
  pickupLocation: string
  pickupInstructions: string
  status: "active" | "draft"
}
