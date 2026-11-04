import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth"
import { ApiError, apiRequest } from "@/lib/api"
import { describeAuthError } from "@/lib/auth-errors"
import { formatDomainList, isEmailAllowed } from "@/lib/email-domains"
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebase"
import type { AppUser, ProfileDetails } from "@/types/user"

/**
 * loading       – checking Firebase / syncing with the API
 * signed-out    – no Firebase user
 * unverified    – email/password account whose email isn't verified yet
 * needs-profile – signed in, but Complete Profile hasn't been saved
 * ready         – signed in with a complete MongoDB profile
 */
export type AuthStatus = "loading" | "signed-out" | "unverified" | "needs-profile" | "ready"

type RegisterInput = { name: string; email: string; password: string }

type AuthContextValue = {
  status: AuthStatus
  user: AppUser | null
  firebaseUser: FirebaseUser | null
  isConfigured: boolean
  allowedEmailDomains: string[]
  /** Error from the last session sync (for example, a non-college email). Shown on the sign-in screen. */
  authError: string
  clearAuthError: () => void
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (input: RegisterInput) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  resendVerificationEmail: () => Promise<void>
  /** Re-checks verification; returns false if the email still isn't verified. */
  confirmEmailVerified: () => Promise<boolean>
  saveProfile: (details: ProfileDetails) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NOT_CONFIGURED = "Sign-in isn't configured yet. Add the VITE_FIREBASE_* values to frontend/.env."

function requireAuth(): Auth {
  if (!firebaseAuth) throw new Error(NOT_CONFIGURED)
  return firebaseAuth
}

function needsEmailVerification(user: FirebaseUser) {
  return !user.emailVerified && user.providerData.some((provider) => provider.providerId === "password")
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isFirebaseConfigured ? "loading" : "signed-out")
  const [user, setUser] = useState<AppUser | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [allowedEmailDomains, setAllowedEmailDomains] = useState<string[]>([])
  const [authError, setAuthError] = useState("")

  // Creates or loads the MongoDB user for this Firebase account. On failure the Firebase
  // session is ended too, so the app is never half signed in.
  const syncSession = useCallback(async (account: FirebaseUser) => {
    try {
      const { user: appUser } = await apiRequest<{ user: AppUser }>("/auth/session", {
        method: "POST",
        body: { name: account.displayName ?? undefined },
      })
      if (firebaseAuth?.currentUser?.uid !== account.uid) return
      setUser(appUser)
      setStatus(appUser.isProfileComplete ? "ready" : "needs-profile")
    } catch (error) {
      setUser(null)
      setAuthError(error instanceof ApiError ? error.message : "We couldn't finish signing you in. Please try again.")
      if (firebaseAuth) await firebaseSignOut(firebaseAuth).catch(() => undefined)
      setStatus("signed-out")
    }
  }, [])

  useEffect(() => {
    if (!firebaseAuth) return
    return onAuthStateChanged(firebaseAuth, (account) => {
      setFirebaseUser(account)
      if (!account) {
        setUser(null)
        setStatus("signed-out")
        return
      }
      if (needsEmailVerification(account)) {
        setUser(null)
        setStatus("unverified")
        return
      }
      setStatus("loading")
      void syncSession(account)
    })
  }, [syncSession])

  useEffect(() => {
    apiRequest<{ allowedEmailDomains: string[] }>("/auth/config", { auth: false })
      .then((config) => setAllowedEmailDomains(config.allowedEmailDomains))
      .catch(() => undefined)
  }, [])

  const clearAuthError = useCallback(() => setAuthError(""), [])

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })
    try {
      await signInWithPopup(requireAuth(), provider)
    } catch (error) {
      throw new Error(describeAuthError(error, "Google sign-in didn't complete. Please try again."))
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(requireAuth(), email.trim(), password)
    } catch (error) {
      throw new Error(describeAuthError(error))
    }
  }, [])

  const registerWithEmail = useCallback(
    async ({ name, email, password }: RegisterInput) => {
      if (!isEmailAllowed(email, allowedEmailDomains)) {
        throw new Error(`Use your college email address (${formatDomainList(allowedEmailDomains)}).`)
      }
      try {
        const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)
        await updateProfile(credential.user, { displayName: name.trim() })
        await sendEmailVerification(credential.user)
      } catch (error) {
        throw new Error(describeAuthError(error))
      }
    },
    [allowedEmailDomains],
  )

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(requireAuth(), email.trim())
    } catch (error) {
      // Don't reveal whether an account exists for this email.
      if (error instanceof Error && "code" in error && error.code === "auth/user-not-found") return
      throw new Error(describeAuthError(error))
    }
  }, [])

  const resendVerificationEmail = useCallback(async () => {
    const current = requireAuth().currentUser
    if (!current) throw new Error("Sign in again to resend the verification email.")
    try {
      await sendEmailVerification(current)
    } catch (error) {
      throw new Error(describeAuthError(error))
    }
  }, [])

  const confirmEmailVerified = useCallback(async () => {
    const current = requireAuth().currentUser
    if (!current) return false
    await reload(current)
    if (!current.emailVerified) return false
    await current.getIdToken(true) // refresh so the token carries email_verified = true
    setStatus("loading")
    await syncSession(current)
    return true
  }, [syncSession])

  const saveProfile = useCallback(async (details: ProfileDetails) => {
    const { user: appUser } = await apiRequest<{ user: AppUser }>("/users/me", {
      method: "PUT",
      body: { ...details, phone: details.phone.trim() },
    })
    setUser(appUser)
    setStatus("ready")
  }, [])

  const signOut = useCallback(async () => {
    setAuthError("")
    if (firebaseAuth) await firebaseSignOut(firebaseAuth)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      firebaseUser,
      isConfigured: isFirebaseConfigured,
      allowedEmailDomains,
      authError: authError || (isFirebaseConfigured ? "" : NOT_CONFIGURED),
      clearAuthError,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
      sendPasswordReset,
      resendVerificationEmail,
      confirmEmailVerified,
      saveProfile,
      signOut,
    }),
    [status, user, firebaseUser, allowedEmailDomains, authError, clearAuthError, signInWithGoogle, signInWithEmail, registerWithEmail, sendPasswordReset, resendVerificationEmail, confirmEmailVerified, saveProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.")
  return context
}
