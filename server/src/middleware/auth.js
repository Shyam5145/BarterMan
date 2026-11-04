import { firebaseAuth } from '../config/firebase.js';
import { User } from '../models/User.js';
import { describeAllowedDomains, isEmailDomainAllowed } from '../utils/emailDomains.js';
import { ApiError, asyncHandler } from '../utils/http.js';

function bearerToken(req) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Verifies the Firebase ID token and enforces the verified-email and college-domain rules.
export const requireAuth = asyncHandler(async (req, _res, next) => {
  req.auth = await verifyAccessToken(bearerToken(req));
  next();
});

/**
 * Checks a Firebase ID token against Barterman's sign-in rules and returns the caller's identity.
 * Shared by HTTP requests and Socket.IO connections. Throws ApiError when access is denied.
 */
export async function verifyAccessToken(token) {
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }

  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(token);
  } catch {
    throw new ApiError(401, 'INVALID_TOKEN', 'Your session has expired. Please sign in again.');
  }

  if (!decoded.email) {
    throw new ApiError(403, 'EMAIL_REQUIRED', 'Your account needs an email address to use Barterman.');
  }
  if (!decoded.email_verified) {
    throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email address before continuing.');
  }
  if (!isEmailDomainAllowed(decoded.email)) {
    throw new ApiError(
      403,
      'EMAIL_DOMAIN_NOT_ALLOWED',
      `Barterman is currently open to college email addresses only (${describeAllowedDomains()}). Sign in with your college account.`,
    );
  }

  return {
    uid: decoded.uid,
    email: decoded.email.toLowerCase(),
    name: decoded.name ?? '',
    picture: decoded.picture ?? '',
    provider: decoded.firebase?.sign_in_provider ?? 'unknown',
  };
}

// For public routes that show more to a signed-in viewer: sets req.user when a valid token is
// sent, and otherwise continues anonymously instead of failing.
export const optionalUser = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) return next();
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    if (decoded.email_verified && decoded.email && isEmailDomainAllowed(decoded.email)) {
      req.user = await User.findOne({ firebaseUid: decoded.uid });
    }
  } catch {
    // Invalid or expired token: treat the viewer as anonymous.
  }
  return next();
});

// Selling requires a saved profile (it sets the listing's campus). Use after loadCurrentUser.
export function requireCompleteProfile(req, _res, next) {
  if (!req.user?.profileCompletedAt) {
    return next(new ApiError(403, 'PROFILE_INCOMPLETE', 'Complete your profile before listing items.'));
  }
  return next();
}

// Loads the MongoDB user for the verified Firebase account. Use after requireAuth.
export const loadCurrentUser = asyncHandler(async (req, _res, next) => {
  const user = await User.findOne({ firebaseUid: req.auth.uid });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Your account is not set up yet. Please sign in again.');
  }
  req.user = user;
  next();
});
