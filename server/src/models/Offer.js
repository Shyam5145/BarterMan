import mongoose from 'mongoose';

/**
 * A buyer's price offer on a listing, made inside their conversation with the seller.
 * pending → accepted | rejected | countered (seller's reply), or replaced by the buyer's newer offer.
 */
export const OFFER_STATUSES = ['pending', 'accepted', 'rejected', 'countered', 'replaced'];
export const MAX_OFFER_AMOUNT = 10_000_000;

const offerSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1, max: MAX_OFFER_AMOUNT },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    status: { type: String, enum: OFFER_STATUSES, default: 'pending' },
    /** The seller's counter price, when status is 'countered'. */
    counterAmount: { type: Number, default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

offerSchema.index({ seller: 1, status: 1, createdAt: -1 });
offerSchema.index({ conversation: 1, status: 1 });
offerSchema.index({ buyer: 1, createdAt: -1 });

export const Offer = mongoose.model('Offer', offerSchema);
