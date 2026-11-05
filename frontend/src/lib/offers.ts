import { apiRequest } from "./api"
import type { ChatUser } from "../types/chat"
import type { ListingStatus } from "../types/listing"

export type OfferStatus = "pending" | "accepted" | "rejected" | "countered" | "withdrawn" | "replaced"

export type Offer = {
  id: string
  conversationId: string
  sellerId: string
  /** The agreed price once accepted (a buyer accepting a counter takes the counter price). */
  amount: number
  note: string
  status: OfferStatus
  /** The seller's counter price when status is "countered". */
  counterAmount: number | null
  createdAt: string
  respondedAt: string | null
  buyer: ChatUser
  listing: { id: string; title: string; imageUrl: string; status: ListingStatus | null; askingPrice: string }
}

/** Buyer makes an offer in their conversation about a listing (it's also posted in the chat). */
export async function createOffer(conversationId: string, amount: number, note = "") {
  const { offer } = await apiRequest<{ offer: Offer }>("/offers", { method: "POST", body: { conversationId, amount, note } })
  return offer
}

/** Offers on the signed-in seller's listings. */
export function fetchReceivedOffers(status: OfferStatus | "all" = "all") {
  return apiRequest<{ items: Offer[]; pendingCount: number }>(`/offers/received?status=${status}`)
}

/** Seller: accept | reject | counter (pending offer). Buyer: accept | reject (countered offer), withdraw (pending offer). */
export type OfferAction = "accept" | "reject" | "counter" | "withdraw"

export async function respondToOffer(offerId: string, action: OfferAction, amount?: number) {
  const { offer } = await apiRequest<{ offer: Offer }>(`/offers/${encodeURIComponent(offerId)}`, {
    method: "PATCH",
    body: amount === undefined ? { action } : { action, amount },
  })
  return offer
}

/** The latest offer in a conversation (for the deal bar in Messages), or null. */
export async function fetchConversationOffer(conversationId: string) {
  const { offer } = await apiRequest<{ offer: Offer | null }>(`/offers/conversation/${encodeURIComponent(conversationId)}`)
  return offer
}

/** Socket event sent to the buyer and seller whenever an offer changes. */
export type OfferUpdatedEvent = { offer: Offer }
