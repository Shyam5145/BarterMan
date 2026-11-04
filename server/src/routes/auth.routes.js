import { Router } from 'express';
import { z } from 'zod';
import { COLLEGES_BY_DOMAIN } from '../config/colleges.js';
import { env } from '../config/env.js';
import { collegeForEmail } from '../utils/emailDomains.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/http.js';

export const authRouter = Router();

// Public: lets the sign-in and register screens show and pre-check the allowed domains.
authRouter.get('/config', (_req, res) => {
  res.json({ allowedEmailDomains: env.allowedEmailDomains, collegesByDomain: COLLEGES_BY_DOMAIN });
});

const sessionSchema = z.object({
  name: z.string().trim().max(120).optional(),
});

// Called after every Firebase sign-in: creates the MongoDB user on first login, updates it after.
authRouter.post(
  '/session',
  requireAuth,
  validateBody(sessionSchema),
  asyncHandler(async (req, res) => {
    const { uid, email, name, picture, provider } = req.auth;

    // Match by email too, so an account re-created in Firebase re-links to its existing data.
    // Safe because requireAuth only admits verified email addresses.
    let user = await User.findOne({ $or: [{ firebaseUid: uid }, { email }] });

    if (!user) {
      user = new User({
        firebaseUid: uid,
        email,
        name: name || req.body.name || email.split('@')[0],
        avatarUrl: picture,
        authProvider: provider,
      });
    } else {
      user.firebaseUid = uid;
      user.email = email;
      if (!user.avatarUrl && picture) user.avatarUrl = picture;
    }

    // Pre-fill the college from the email domain so Complete Profile starts with it.
    if (!user.college) user.college = collegeForEmail(email);
    user.lastLoginAt = new Date();
    await user.save();
    res.json({ user });
  }),
);
