import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { loadCurrentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Conversation } from '../models/Conversation.js';
import { Listing, SELLER_PUBLIC_FIELDS } from '../models/Listing.js';
import { MAX_OFFER_AMOUNT, Offer } from '../models/Offer.js';
import { emitToUser } from '../realtime/socket.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { postMessage } from './conversations.routes.js';

/**
 * Price offers. Every offer and every reply is also posted as a message in the chat, and both
 * people get a live `offer:updated` event so Seller Hub and Messages stay in sync.
 */
export const offersRouter = Router();

offersRouter.use(requireAuth, loadCurrentUser);

const OFFERABLE_STATUSES = ['active', 'pending'];
const LISTING_FIELDS = 'title images status listingType price rentalPrice rentalDuration';
const RENTAL_SUFFIX = { 'Per day': '/day', 'Per week': '/week', 'Per month': '/month', Flexible: '' };
const DETAILS = [{ path: 'buyer', select: SELLER_PUBLIC_FIELDS }, { path: 'listing', select: LISTING_FIELDS }];

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
    sellerId: String(offer.seller),
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

/** Sends the offer's current state to the buyer and the seller (every open tab). */
async function broadcast(offer) {
  if (!offer.populated?.('buyer')) await offer.populate(DETAILS);
  const payload = { offer: serializeOffer(offer) };
  emitToUser(offer.seller, 'offer:updated', payload);
  emitToUser(offer.buyer?._id ?? offer.buyer, 'offer:updated', payload);
  return payload.offer;
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

    // A new offer replaces the buyer's earlier one that is still open (pending or countered).
    const open = await Offer.find({ conversation: conversation._id, status: { $in: ['pending', 'countered'] } });
    for (const previous of open) {
      previous.status = 'replaced';
      await previous.save();
      await broadcast(previous);
    }

    const offer = await Offer.create({
      listing: listing._id,
      conversation: conversation._id,
      buyer: req.user._id,
      seller: conversation.seller,
      amount,
      note,
    });

    // Short chat text ("Offered ₹500 …"); the offer card in the chat shows the details.
    const text = `Offered ${formatInr(amount)} for "${listing.title}"${note ? `\n${note}` : ''}`;
    await postMessage(conversation, req.user._id, text, undefined, { id: offer._id, event: 'offer', amount, note });

    res.status(201).json({ offer: await broadcast(offer) });
  }),
);

const receivedQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'all']).default('all'),
});

// Offers on the signed-in seller's listings (Seller Hub). Replaced offers are left out.
offersRouter.get(
  '/received',
  asyncHandler(async (req, res) => {
    const parsed = receivedQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a valid offer status.');
    const { status } = parsed.data;
    const filter = { seller: req.user._id, status: status === 'all' ? { $ne: 'replaced' } : status };
    const [offers, pendingCount] = await Promise.all([
      Offer.find(filter).sort({ createdAt: -1 }).limit(200).populate(DETAILS),
      Offer.countDocuments({ seller: req.user._id, status: 'pending' }),
    ]);
    res.json({ items: offers.map(serializeOffer), pendingCount });
  }),
);

// The latest offer in a conversation (for the deal bar in Messages), or null.
offersRouter.get(
  '/conversation/:conversationId',
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', "This conversation doesn't exist.");
    const conversation = await Conversation.exists({ _id: conversationId, $or: [{ buyer: req.user._id }, { seller: req.user._id }] });
    if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', "This conversation doesn't exist.");
    const offer = await Offer.findOne({ conversation: conversationId, status: { $ne: 'replaced' } })
      .sort({ createdAt: -1 })
      .populate(DETAILS);
    res.json({ offer: offer ? serializeOffer(offer) : null });
  }),
);

const respondSchema = z
  .object({
    action: z.enum(['accept', 'reject', 'counter', 'withdraw'], { message: 'Choose a valid action.' }),
    amount: amountSchema.optional(),
  })
  .strict()
  .refine((body) => body.action !== 'counter' || body.amount !== undefined, { message: 'Enter your counteroffer amount.', path: ['amount'] });

/**
 * Answer an offer.
 * Seller, on a pending offer: accept | reject | counter (with amount).
 * Buyer, on a countered offer: accept (takes the counter price) | reject; on a pending offer: withdraw.
 * Each answer is posted in the chat.
 */
offersRouter.patch(
  '/:id',
  validateBody(respondSchema),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
    const me = req.user._id;
    const offer = await Offer.findOne({ _id: req.params.id, $or: [{ seller: me }, { buyer: me }] });
    if (!offer) throw notFound();
    const isSeller = offer.seller.equals(me);
    const { action, amount } = req.body;
    const closed = () => new ApiError(409, 'OFFER_CLOSED', 'This offer has already been answered or replaced by a newer one.');

    const listing = await Listing.findById(offer.listing).select(LISTING_FIELDS);
    const title = listing?.title ?? 'this listing';
    let text;
    let event;
    let eventAmount = offer.amount;

    if (isSeller) {
      if (offer.status !== 'pending') throw closed();
      if (action === 'accept') {
        offer.status = 'accepted';
        event = 'accepted';
        text = `Accepted the offer of ${formatInr(offer.amount)} for "${title}". Let's arrange the pickup.`;
      } else if (action === 'reject') {
        offer.status = 'rejected';
        event = 'rejected';
        text = `Declined the offer of ${formatInr(offer.amount)} for "${title}".`;
      } else if (action === 'counter') {
        offer.status = 'countered';
        offer.counterAmount = amount;
        event = 'counter';
        eventAmount = amount;
        text = `Countered with ${formatInr(amount)} for "${title}" (you offered ${formatInr(offer.amount)}).`;
      } else {
        throw new ApiError(400, 'INVALID_ACTION', 'Only the buyer can withdraw an offer.');
      }
    } else if (action === 'withdraw') {
      if (offer.status !== 'pending') throw closed();
      offer.status = 'withdrawn';
      event = 'withdrawn';
      text = `Withdrew the offer of ${formatInr(offer.amount)} for "${title}".`;
    } else if (action === 'accept' || action === 'reject') {
      if (offer.status !== 'countered') throw closed();
      eventAmount = offer.counterAmount;
      if (action === 'accept') {
        if (!listing || !OFFERABLE_STATUSES.includes(listing.status)) {
          throw new ApiError(409, 'LISTING_UNAVAILABLE', 'This listing is no longer available.');
        }
        // The agreed price is the seller's counter.
        event = 'counter_accepted';
        text = `Accepted the counteroffer of ${formatInr(offer.counterAmount)} for "${title}". Let's arrange the pickup.`;
        offer.amount = offer.counterAmount;
        offer.status = 'accepted';
      } else {
        offer.status = 'withdrawn';
        event = 'counter_declined';
        text = `Declined the counteroffer of ${formatInr(offer.counterAmount)} for "${title}".`;
      }
    } else {
      throw new ApiError(400, 'INVALID_ACTION', 'Only the seller can counter an offer.');
    }

    offer.respondedAt = new Date();
    await offer.save();

    const conversation = await Conversation.findById(offer.conversation);
    if (conversation) await postMessage(conversation, me, text, undefined, { id: offer._id, event, amount: eventAmount });

    res.json({ offer: await broadcast(offer) });
  }),
);
