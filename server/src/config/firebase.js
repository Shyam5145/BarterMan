import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';

// Firebase is used only to verify sign-in tokens. Verifying an ID token needs just the
// project ID; a service account is optional and only required for future admin actions.
function initFirebaseAdmin() {
  const [existing] = getApps();
  if (existing) return existing;

  if (env.firebaseServiceAccountPath) {
    const serviceAccount = JSON.parse(
      readFileSync(path.resolve(env.firebaseServiceAccountPath), 'utf8'),
    );
    return initializeApp({ credential: cert(serviceAccount), projectId: env.firebaseProjectId });
  }

  return initializeApp({ projectId: env.firebaseProjectId });
}

export const firebaseAuth = getAuth(initFirebaseAdmin());
