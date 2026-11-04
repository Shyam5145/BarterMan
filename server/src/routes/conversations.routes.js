import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { loadCurrentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { Conversation } from '../models/Conversation.js';
import { Listing, SELLER_PUBLIC_FIELDS } from '../models/Listing.js';
import { MAX_MESSAGE_LENGTH, Message } from '../models/Message.js';
import { emitToUser } from '../realtime/socket.js';
import { ApiError, asyncHandler } from '../utils/http.js';

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth, loadCurrentUser);

const LISTING_SUMMARY_FIELDS = 'title images status listingType price rentalPrice rentalDuration';
/** Listings a buyer can start a new conversation about. */
const MESSAGEABLE_STATUSES = ['active', 'pending'];
const PREVIEW_LENGTH = 300;

const notFound = () => new ApiError(404, 'CONVERSATION_NOT_FOUND', "This conversation doesn't exist.");

function requireProfile(req, _res, next) {
  if (!req.user.profileCompletedAt) {
    return next(new ApiError(403, 'PROFILE_INCOMPLETE', 'Complete your profile before messaging other students.'));
  }
  return next();
}

const DETAILS = [
  { path: 'buyer', select: SELLER_PUBLIC_FIELDS },
  { path: 'seller', select: SELLER_PUBLIC_FIELDS },
  { path: 'listing', select: LISTING_SUMMARY_FIELDS },
];
/** Works on a query or a document (a document's populate returns a promise). */
const withDetails = (queryOrDocument) => queryOrDocument.populate(DETAILS);

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

function primaryImage(images = []) {
  return (images.find((image) => image.isPrimary) ?? images[0])?.url ?? '';
}

/** A conversation as the given participant sees it (their unread count, the other person). */
export function serializeConversation(conversation, viewerId) {
  const role = conversation.roleOf(viewerId);
  const other = role === 'buyer' ? conversation.seller : conversation.buyer;
  const listing = conversation.listing?._id ? conversation.listing : null;
  const { lastMessage } = conversation;
  return {
    id: String(conversation._id),
    role,
    listing: {
      id: String(listing?._id ?? conversation.listing ?? ''),
      title: listing?.title || conversation.listingTitle || 'Listing',
      imageUrl: (listing && primaryImage(listing.images)) || conversation.listingImageUrl,
      /** null when the listing has been deleted. */
      status: listing?.status ?? null,
      listingType: listing?.listingType ?? null,
      price: listing?.price ?? null,
      rentalPrice: listing?.rentalPrice ?? null,
      rentalDuration: listing?.rentalDuration ?? null,
    },
    otherUser: publicUser(other),
    lastMessage: lastMessage?.createdAt
      ? { text: lastMessage.text, senderId: String(lastMessage.sender), createdAt: lastMessage.createdAt }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: role === 'seller' ? conversation.sellerUnread : conversation.buyerUnread,
    /** When the other person last read the thread; drives "Seen" on outgoing messages. */
    otherLastReadAt: role === 'seller' ? conversation.buyerLastReadAt : conversation.sellerLastReadAt,
    createdAt: conversation.createdAt,
  };
}

async function findParticipantConversation(id, user, { details = false } = {}) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const query = Conversation.findOne({ _id: id, $or: [{ buyer: user._id }, { seller: user._id }] });
  const conversation = await (details ? withDetails(query) : query);
  if (!conversation) throw notFound();
  return conversation;
}

export async function unreadTotal(userId) {
  const [result] = await Conversation.aggregate([
    { $match: { $or: [{ buyer: userId }, { seller: userId }] } },
    {
      $group: {
        _id: null,
        total: { $sum: { $cond: [{ $eq: ['$buyer', userId] }, '$buyerUnread', '$sellerUnread'] } },
      },
    },
  ]);
  return result?.total ?? 0;
}

async function pushUnreadCount(userId) {
  emitToUser(userId, 'unread:count', { total: await unreadTotal(new mongoose.Types.ObjectId(String(userId))) });
}

// Total unread messages across the inbox (for the header badge).
conversationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ total: await unreadTotal(req.user._id) });
  }),
);

// The signed-in user's inbox, most recent first. Sellers only see threads with at least one message.
conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const conversations = await withDetails(
      Conversation.find({ $or: [{ buyer: me }, { seller: me, lastMessageAt: { $ne: null } }] })
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .limit(100),
    );
    const items = conversations
      .map((conversation) => serializeConversation(conversation, me))
      .sort((a, b) => new Date(b.lastMessageAt ?? b.createdAt) - new Date(a.lastMessageAt ?? a.createdAt));
    res.json({ items });
  }),
);

const startSchema = z.object({ listingId: z.string().trim().min(1, 'Choose a listing.') }).strict();

// Opens the buyer's conversation about a listing, creating it the first time.
conversationsRouter.post(
  '/',
  requireProfile,
  validateBody(startSchema),
  asyncHandler(async (req, res) => {
    const { listingId } = req.body;
    if (!mongoose.isValidObjectId(listingId)) {
      throw new ApiError(404, 'LISTING_NOT_FOUND', "This listing doesn't exist or is no longer available.");
    }
    const listing = await Listing.findById(listingId).select('seller title images status');
    if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND', "This listing doesn't exist or is no longer available.");
    if (listing.seller.equals(req.user._id)) {
      throw new ApiError(400, 'OWN_LISTING', "You can't message yourself about your own listing.");
    }

    let conversation = await Conversation.findOne({ listing: listing._id, buyer: req.user._id });
    if (!conversation) {
      if (!MESSAGEABLE_STATUSES.includes(listing.status)) {
        throw new ApiError(409, 'LISTING_UNAVAILABLE', 'This listing is no longer available, so the seller cannot be messaged about it.');
      }
      try {
        conversation = await Conversation.create({
          listing: listing._id,
          buyer: req.user._id,
          seller: listing.seller,
          listingTitle: listing.title,
          listingImageUrl: primaryImage(listing.images),
        });
      } catch (error) {
        // Two tabs opened the same chat at once: use the one that won.
        if (error?.code !== 11000) throw error;
        conversation = await Conversation.findOne({ listing: listing._id, buyer: req.user._id });
      }
    }

    await withDetails(conversation);
    res.status(201).json({ conversation: serializeConversation(conversation, req.user._id) });
  }),
);

conversationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = await findParticipantConversation(req.params.id, req.user, { details: true });
    res.json({ conversation: serializeConversation(conversation, req.user._id) });
  }),
);

const historySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Message history, oldest first. Pass `before` (the oldest loaded createdAt) to page backwards.
conversationsRouter.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const parsed = historySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid message history request.');
    const { before, limit } = parsed.data;
    const conversation = await findParticipantConversation(req.params.id, req.user);

    const filter = { conversation: conversation._id, ...(before ? { createdAt: { $lt: new Date(before) } } : {}) };
    const newestFirst = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
    const hasMore = newestFirst.length > limit;
    const items = newestFirst.slice(0, limit).reverse();
    res.json({ items, hasMore });
  }),
);

const sendSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Type a message.')
      .max(MAX_MESSAGE_LENGTH, `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`),
    /** Echoed back on the socket event so the sender's tab can swap its pending bubble for the saved one. */
    clientId: z.string().trim().max(64).optional(),
  })
  .strict();

conversationsRouter.post(
  '/:id/messages',
  requireProfile,
  validateBody(sendSchema),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const existing = await findParticipantConversation(req.params.id, req.user);
    const role = existing.roleOf(me);
    const otherRole = role === 'buyer' ? 'seller' : 'buyer';
    const otherId = existing[otherRole];

    const message = await Message.create({ conversation: existing._id, sender: me, text: req.body.text });
    const now = message.createdAt;

    // Sending counts as reading everything before it.
    const conversation = await withDetails(
      Conversation.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            lastMessage: { text: message.text.slice(0, PREVIEW_LENGTH), sender: me, createdAt: now },
            lastMessageAt: now,
            [`${role}Unread`]: 0,
            [`${role}LastReadAt`]: now,
          },
          $inc: { [`${otherRole}Unread`]: 1 },
        },
        { new: true },
      ),
    );

    const payload = message.toJSON();
    const { clientId } = req.body;
    emitToUser(me, 'message:new', { conversation: serializeConversation(conversation, me), message: payload, clientId });
    emitToUser(otherId, 'message:new', { conversation: serializeConversation(conversation, otherId), message: payload });
    await Promise.all([pushUnreadCount(otherId), pushUnreadCount(me)]);

    res.status(201).json({ message: payload, conversation: serializeConversation(conversation, me) });
  }),
);

// Marks the thread read for the signed-in user and tells the other person (read receipt).
conversationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const existing = await findParticipantConversation(req.params.id, req.user);
    const role = existing.roleOf(me);
    const otherId = role === 'buyer' ? existing.seller : existing.buyer;
    const readAt = new Date();

    await Conversation.updateOne({ _id: existing._id }, { $set: { [`${role}Unread`]: 0, [`${role}LastReadAt`]: readAt } });

    const event = { conversationId: String(existing._id), readerId: String(me), readAt };
    emitToUser(me, 'conversation:read', event);
    emitToUser(otherId, 'conversation:read', event);
    await pushUnreadCount(me);

    res.json({ readAt });
  }),
);
