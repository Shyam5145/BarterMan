import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

// Firebase is used only for Authentication. Application data lives in MongoDB behind the API.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)

export const firebaseAuth = isFirebaseConfigured ? getAuth(initializeApp(firebaseConfig)) : null
