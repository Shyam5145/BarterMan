import { FirebaseError } from "firebase/app"

const WRONG_CREDENTIALS = "That email and password don't match. Try again or reset your password."
const CANCELLED = "Sign-in was cancelled. You can try again whenever you're ready."

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": WRONG_CREDENTIALS,
  "auth/wrong-password": WRONG_CREDENTIALS,
  "auth/user-not-found": WRONG_CREDENTIALS,
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-password": "Enter your password.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Choose a stronger password of at least 8 characters.",
  "auth/popup-closed-by-user": CANCELLED,
  "auth/cancelled-popup-request": CANCELLED,
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "auth/account-exists-with-different-credential": "An account already exists for this email with a different sign-in method.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/unauthorized-domain": "This site isn't authorized for sign-in yet. Add it under Firebase Authentication > Settings > Authorized domains.",
  "auth/requires-recent-login": "For your security, sign out and continue with Google again, then create your password.",
  "auth/credential-already-in-use": "This email already has a separate Barterman password account. Sign out and sign in with that email and password instead.",
  "auth/operation-not-allowed":"This sign-in method isn't enabled yet in Firebase Authentication.",
}

export function describeAuthError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof FirebaseError) return MESSAGES[error.code] ?? fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}
