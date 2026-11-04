import { Router } from 'express';
import mongoose from 'mongoose';
import { loadCurrentUser, requireAuth } from '../middleware/auth.js';
import { Listing, PRIVATE_STATUSES, SELLER_PUBLIC_FIELDS } from '../models/Listing.js';
import { SavedListing } from '../models/SavedListing.js';
import { ApiError, asyncHandler } from '../utils/http.js';

/** Mounted at /users/me/wishlist: the signed-in student's saved (hearted) listings. */
export const wishlistRouter = Router();

wishlistRouter.use(requireAuth, loadCurrentUser);

const MAX_SAVED = 500;

const notFound = () => new ApiError(404, 'LISTING_NOT_FOUND', "This listing doesn't exist or is no longer available.");

// Just the saved listing ids, so the marketplace can fill in the hearts.
wishlistRouter.get(
  '/ids',
  asyncHandler(async (req, res) => {
    const rows = await SavedListing.find({ user: req.user._id }).select('listing').limit(MAX_SAVED).lean();
    res.json({ ids: rows.map((row) => String(row.listing)) });
  }),
);

// Saved listings, newest save first. Listings that were deleted, or hidden by their seller, are left out.
wishlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await SavedListing.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(MAX_SAVED)
      .populate({ path: 'listing', populate: { path: 'seller', select: SELLER_PUBLIC_FIELDS } });

    const gone = rows.filter((row) => !row.listing).map((row) => row._id);
    if (gone.length) await SavedListing.deleteMany({ _id: { $in: gone } });

    const items = rows
      .filter((row) => row.listing && !PRIVATE_STATUSES.includes(row.listing.status))
      .map((row) => ({
        ...row.listing.toJSON(),
        isOwner: row.listing.seller?._id?.equals?.(req.user._id) ?? false,
        savedAt: row.createdAt,
      }));
    res.json({ items });
  }),
);

wishlistRouter.put(
  '/:listingId',
  asyncHandler(async (req, res) => {
    const { listingId } = req.params;
    if (!mongoose.isValidObjectId(listingId)) throw notFound();
    const listing = await Listing.findById(listingId).select('seller status');
    if (!listing || PRIVATE_STATUSES.includes(listing.status)) throw notFound();
    if (listing.seller.equals(req.user._id)) {
      throw new ApiError(400, 'OWN_LISTING', "You can't add your own listing to your wishlist.");
    }
    const count = await SavedListing.countDocuments({ user: req.user._id });
    if (count >= MAX_SAVED) throw new ApiError(409, 'WISHLIST_FULL', `Your wishlist can hold up to ${MAX_SAVED} items.`);

    await SavedListing.updateOne(
      { user: req.user._id, listing: listing._id },
      { $setOnInsert: { user: req.user._id, listing: listing._id } },
      { upsert: true },
    );
    res.json({ saved: true });
  }),
);

wishlistRouter.delete(
  '/:listingId',
  asyncHandler(async (req, res) => {
    const { listingId } = req.params;
    if (mongoose.isValidObjectId(listingId)) {
      await SavedListing.deleteOne({ user: req.user._id, listing: listingId });
    }
    res.json({ saved: false });
  }),
);
