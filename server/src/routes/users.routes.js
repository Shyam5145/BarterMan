import { Router } from 'express';
import { z } from 'zod';
import { loadCurrentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Listing, SELLER_PUBLIC_FIELDS } from '../models/Listing.js';
import { YEAR_OPTIONS } from '../models/User.js';
import { collegeForEmail } from '../utils/emailDomains.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { myListingsQuerySchema } from '../validators/listing.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, loadCurrentUser);

usersRouter.get('/me', (req, res) => {
  res.json({ user: req.user });
});

// All of the signed-in user's listings, any status, for Seller Hub.
usersRouter.get(
  '/me/listings',
  asyncHandler(async (req, res) => {
    const parsed = myListingsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a valid status.');
    const filter = { seller: req.user._id, ...(parsed.data.status ? { status: parsed.data.status } : {}) };
    const listings = await Listing.find(filter).sort({ updatedAt: -1 }).limit(200).populate('seller', SELLER_PUBLIC_FIELDS);
    res.json({ items: listings.map((listing) => ({ ...listing.toJSON(), isOwner: true })) });
  }),
);

const profileSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(120).optional(),
    college: z.string().trim().min(2, 'Enter your college or university.').max(150),
    course: z.string().trim().min(2, 'Enter your course or department.').max(120),
    year: z.enum(YEAR_OPTIONS, { message: 'Select your year of study.' }),
    phone: z
      .string()
      .trim()
      .max(20, 'Phone number is too long.')
      .regex(/^[+()\d\s-]*$/, 'Enter a valid phone number.')
      .optional()
      .default(''),
  })
  .strict();

usersRouter.put(
  '/me',
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    req.user.set(req.body);
    // A known college email decides the college; it can't be edited to something else.
    const college = collegeForEmail(req.user.email);
    if (college) req.user.college = college;
    if (!req.user.profileCompletedAt) req.user.profileCompletedAt = new Date();
    await req.user.save();
    res.json({ user: req.user });
  }),
);
