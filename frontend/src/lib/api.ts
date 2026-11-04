import { firebaseAuth } from "./firebase"

const API_BASE = `${import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") ?? ""}/api/v1`

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** A plain object is sent as JSON; FormData is sent as multipart (for photo uploads). */
  body?: unknown
  /**
   * true (default): require a signed-in user and send their Firebase ID token.
   * "optional": send the token only if someone is signed in.
   * false: never send it.
   */
  auth?: boolean | "optional"
}

export async function apiRequest<T>(path: string, { method = "GET", body, auth = true }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json"

  if (auth) {
    const currentUser = firebaseAuth?.currentUser
    if (currentUser) headers.Authorization = `Bearer ${await currentUser.getIdToken()}`
    else if (auth === true) throw new ApiError("Sign in to continue.", 401, "UNAUTHENTICATED")
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError("We can't reach the Barterman server right now. Check your connection and try again.", 0, "NETWORK_ERROR")
  }

  const data = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null
  if (!response.ok) {
    throw new ApiError(data?.error?.message ?? `Request failed (${response.status}).`, response.status, data?.error?.code)
  }
  return data as T
}
