import mongoose from 'mongoose';

/** A listing a student hearted on the marketplace (their wishlist). One row per user and listing. */
const savedListingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

savedListingSchema.index({ user: 1, listing: 1 }, { unique: true });
savedListingSchema.index({ user: 1, createdAt: -1 });
savedListingSchema.index({ listing: 1 });

export const SavedListing = mongoose.model('SavedListing', savedListingSchema);
