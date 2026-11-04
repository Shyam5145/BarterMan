import mongoose from 'mongoose';

/**
 * One chat thread between a buyer and the seller of a listing. There is at most one
 * conversation per (listing, buyer). The listing title and photo are copied in so the
 * inbox still makes sense after a listing is edited or deleted.
 */
const conversationSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listingTitle: { type: String, default: '' },
    listingImageUrl: { type: String, default: '' },
    lastMessage: {
      text: { type: String, default: '' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      createdAt: { type: Date, default: null },
    },
    /** Null until the first message, so a buyer opening a chat doesn't show up in the seller's inbox. */
    lastMessageAt: { type: Date, default: null },
    buyerUnread: { type: Number, default: 0 },
    sellerUnread: { type: Number, default: 0 },
    buyerLastReadAt: { type: Date, default: null },
    sellerLastReadAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ listing: 1, buyer: 1 }, { unique: true });
conversationSchema.index({ buyer: 1, updatedAt: -1 });
conversationSchema.index({ seller: 1, lastMessageAt: -1 });

/** 'buyer', 'seller', or null when the user isn't part of this conversation. */
conversationSchema.methods.roleOf = function roleOf(userId) {
  const id = String(userId);
  if (String(this.buyer?._id ?? this.buyer) === id) return 'buyer';
  if (String(this.seller?._id ?? this.seller) === id) return 'seller';
  return null;
};

export const Conversation = mongoose.model('Conversation', conversationSchema);
