import { apiRequest } from "./api"
import type { ChatMessage, Conversation } from "../types/chat"

export async function fetchConversations() {
  const { items } = await apiRequest<{ items: Conversation[] }>("/conversations")
  return items
}

/** Opens (or creates) the signed-in buyer's conversation about a listing. */
export async function startConversation(listingId: string) {
  const { conversation } = await apiRequest<{ conversation: Conversation }>("/conversations", {
    method: "POST",
    body: { listingId },
  })
  return conversation
}

export async function fetchConversation(id: string) {
  const { conversation } = await apiRequest<{ conversation: Conversation }>(`/conversations/${encodeURIComponent(id)}`)
  return conversation
}

/** Oldest first. Pass the oldest loaded createdAt as `before` to load earlier messages. */
export function fetchMessages(id: string, before?: string) {
  const query = before ? `?before=${encodeURIComponent(before)}` : ""
  return apiRequest<{ items: ChatMessage[]; hasMore: boolean }>(`/conversations/${encodeURIComponent(id)}/messages${query}`)
}

export function sendMessage(id: string, text: string, clientId: string) {
  return apiRequest<{ message: ChatMessage; conversation: Conversation }>(`/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: { text, clientId },
  })
}

export function markConversationRead(id: string) {
  return apiRequest<{ readAt: string }>(`/conversations/${encodeURIComponent(id)}/read`, { method: "POST" })
}

export async function fetchUnreadCount() {
  const { total } = await apiRequest<{ total: number }>("/conversations/unread-count")
  return total
}
