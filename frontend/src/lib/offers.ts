import { apiRequest } from "./api"
import type { ChatUser } from "../types/chat"
import type { ListingStatus } from "../types/listing"

export type OfferStatus = "pending" | "accepted" | "rejected" | "countered"

export type Offer = {
  id: string
  conversationId: string
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

export async function respondToOffer(offerId: string, action: "accept" | "reject" | "counter", amount?: number) {
  const { offer } = await apiRequest<{ offer: Offer }>(`/offers/${encodeURIComponent(offerId)}`, {
    method: "PATCH",
    body: amount === undefined ? { action } : { action, amount },
  })
  return offer
}
