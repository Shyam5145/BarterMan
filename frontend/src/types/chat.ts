import type { ListingStatus, ListingType } from "./listing"

export const MAX_MESSAGE_LENGTH = 2000

/** Public profile of the other person in a conversation. */
export type ChatUser = {
  id: string
  name: string
  avatarUrl: string
  college: string
  course: string
  year: string
}

export type ConversationListing = {
  id: string
  title: string
  imageUrl: string
  /** null when the listing has been deleted. */
  status: ListingStatus | null
  listingType: ListingType | null
  price: number | null
  rentalPrice: number | null
  rentalDuration: string | null
}

/** A conversation as the signed-in user sees it. */
export type Conversation = {
  id: string
  role: "buyer" | "seller"
  listing: ConversationListing
  otherUser: ChatUser
  lastMessage: { text: string; senderId: string; createdAt: string } | null
  lastMessageAt: string | null
  unreadCount: number
  /** When the other person last read the thread. */
  otherLastReadAt: string | null
  createdAt: string
}

export type ChatMessage = {
  id: string
  conversationId: string
  senderId: string
  text: string
  createdAt: string
}

/** Socket.IO events pushed by the server. */
export type MessageNewEvent = { conversation: Conversation; message: ChatMessage; clientId?: string }
export type ConversationReadEvent = { conversationId: string; readerId: string; readAt: string }
export type TypingEvent = { conversationId: string; userId: string; isTyping: boolean }
