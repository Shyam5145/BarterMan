import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { loadCurrentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Conversation } from '../models/Conversation.js';
import { Listing, SELLER_PUBLIC_FIELDS } from '../models/Listing.js';
import { MAX_OFFER_AMOUNT, Offer } from '../models/Offer.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { postMessage } from './conversations.routes.js';

/** Price offers. Each offer and each seller reply is also posted as a message in the chat. */
export const offersRouter = Router();

offersRouter.use(requireAuth, loadCurrentUser);

const OFFERABLE_STATUSES = ['active', 'pending'];
const LISTING_FIELDS = 'title images status listingType price rentalPrice rentalDuration';
const RENTAL_SUFFIX = { 'Per day': '/day', 'Per week': '/week', 'Per month': '/month', Flexible: '' };

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const formatInr = (value) => inr.format(value ?? 0);

function askingPrice(listing) {
  if (listing.listingType === 'for_rent') return `${formatInr(listing.rentalPrice)}${RENTAL_SUFFIX[listing.rentalDuration] ?? ''}`;
  return formatInr(listing.price);
}

const notFound = () => new ApiError(404, 'OFFER_NOT_FOUND', "This offer doesn't exist.");

function publicUser(user) {
  if (!user?._id) return { id: String(user ?? ''), name: 'Barterman student', avatarUrl: '', college: '', course: '', year: '' };
  return {
    id: String(user._id),
    name: user.name || 'Barterman student',
    avatarUrl: user.avatarUrl ?? '',
    college: user.college ?? '',
    course: user.course ?? '',
    year: user.year ?? '',
  };
}

function serializeOffer(offer) {
  const listing = offer.listing?._id ? offer.listing : null;
  const images = listing?.images ?? [];
  return {
    id: String(offer._id),
    conversationId: String(offer.conversation),
    amount: offer.amount,
    note: offer.note,
    status: offer.status,
    counterAmount: offer.counterAmount,
    createdAt: offer.createdAt,
    respondedAt: offer.respondedAt,
    buyer: publicUser(offer.buyer),
    listing: {
      id: String(listing?._id ?? offer.listing ?? ''),
      title: listing?.title || 'Deleted listing',
      imageUrl: (images.find((image) => image.isPrimary) ?? images[0])?.url ?? '',
      status: listing?.status ?? null,
      askingPrice: listing ? askingPrice(listing) : '',
    },
  };
}

const amountSchema = z.coerce
  .number({ message: 'Enter an amount.' })
  .int('Use a whole number of rupees.')
  .min(1, 'Enter an amount above ₹0.')
  .max(MAX_OFFER_AMOUNT, 'That amount is too high.');

const createSchema = z
  .object({
    conversationId: z.string().trim().min(1),
    amount: amountSchema,
    note: z.string().trim().max(300, 'Keep the note under 300 characters.').optional().default(''),
  })
  .strict();

// Buyer makes an offer in their conversation about a listing.
offersRouter.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.user.profileCompletedAt) {
      throw new ApiError(403, 'PROFILE_INCOMPLETE', 'Complete your profile before making offers.');
    }
    const { conversationId, amount, note } = req.body;
    if (!mongoose.isValidObjectId(conversationId)) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', "This conversation doesn't exist.");
    const conversation = await Conversation.findOne({ _id: conversationId, buyer: req.user._id });
    if (!conversation) {
      throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Only the buyer in this conversation can make an offer.');
    }
    const listing = await Listing.findById(conversation.listing).select(LISTING_FIELDS);
    if (!listing || !OFFERABLE_STATUSES.includes(listing.status)) {
      throw new ApiError(409, 'LISTING_UNAVAILABLE', 'This listing is no longer available for offers.');
    }

    // A new offer replaces the buyer's earlier one that the seller hasn't answered.
    await Offer.updateMany({ conversation: conversation._id, status: 'pending' }, { $set: { status: 'replaced' } });
    const offer = await Offer.create({
      listing: listing._id,
      conversation: conversation._id,
      buyer: req.user._id,
      seller: conversation.seller,
      amount,
      note,
    });

    const text = `Offer: ${formatInr(amount)} for "${listing.title}" (listed at ${askingPrice(listing)}).${note ? `\n${note}` : ''}`;
    await postMessage(conversation, req.user._id, text);

    await offer.populate([{ path: 'buyer', select: SELLER_PUBLIC_FIELDS }, { path: 'listing', select: LISTING_FIELDS }]);
    res.status(201).json({ offer: serializeOffer(offer) });
  }),
);

const receivedQuerySchema = z.object({ status: z.enum(['pending', 'accepted', 'rejected', 'countered', 'all']).default('all') });

// Offers on the signed-in seller's listings (Seller Hub). Replaced offers are left out.
offersRouter.get(
  '/received',
  asyncHandler(async (req, res) => {
    const parsed = receivedQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a valid offer status.');
    const { status } = parsed.data;
    const filter = { seller: req.user._id, status: status === 'all' ? { $ne: 'replaced' } : status };
    const [offers, pendingCount] = await Promise.all([
      Offer.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('buyer', SELLER_PUBLIC_FIELDS)
        .populate('listing', LISTING_FIELDS),
      Offer.countDocuments({ seller: req.user._id, status: 'pending' }),
    ]);
    res.json({ items: offers.map(serializeOffer), pendingCount });
  }),
);

const respondSchema = z
  .object({
    action: z.enum(['accept', 'reject', 'counter'], { message: 'Choose accept, reject, or counter.' }),
    amount: amountSchema.optional(),
  })
  .strict()
  .refine((body) => body.action !== 'counter' || body.amount !== undefined, { message: 'Enter your counteroffer amount.', path: ['amount'] });

// Seller answers a pending offer. The answer is posted in the chat for the buyer.
offersRouter.patch(
  '/:id',
  validateBody(respondSchema),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
    const offer = await Offer.findOne({ _id: req.params.id, seller: req.user._id });
    if (!offer) throw notFound();
    if (offer.status !== 'pending') {
      throw new ApiError(409, 'OFFER_CLOSED', 'This offer has already been answered or replaced by a newer one.');
    }

    const { action, amount } = req.body;
    const listing = await Listing.findById(offer.listing).select(LISTING_FIELDS);
    const title = listing?.title ?? 'this listing';
    let text;
    if (action === 'accept') {
      offer.status = 'accepted';
      text = `Offer accepted: ${formatInr(offer.amount)} for "${title}". Let's arrange the pickup.`;
    } else if (action === 'reject') {
      offer.status = 'rejected';
      text = `Offer of ${formatInr(offer.amount)} for "${title}" declined.`;
    } else {
      offer.status = 'countered';
      offer.counterAmount = amount;
      text = `Counteroffer: ${formatInr(amount)} for "${title}" (you offered ${formatInr(offer.amount)}).`;
    }
    offer.respondedAt = new Date();
    await offer.save();

    const conversation = await Conversation.findById(offer.conversation);
    if (conversation) await postMessage(conversation, req.user._id, text);

    await offer.populate([{ path: 'buyer', select: SELLER_PUBLIC_FIELDS }, { path: 'listing', select: LISTING_FIELDS }]);
    res.json({ offer: serializeOffer(offer) });
  }),
);
