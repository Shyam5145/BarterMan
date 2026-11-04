import { Router } from 'express';
import mongoose from 'mongoose';
import { loadCurrentUser, optionalUser, requireAuth, requireCompleteProfile } from '../middleware/auth.js';
import { listingForm } from '../middleware/upload.js';
import { validateBody } from '../middleware/validate.js';
import { Listing, PRIVATE_STATUSES, SELLER_PUBLIC_FIELDS } from '../models/Listing.js';
import { SavedListing } from '../models/SavedListing.js';
import { destroyImages, uploadListingImages } from '../services/images.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { listingInputSchema, listingQuerySchema, listingStatusSchema } from '../validators/listing.js';

export const listingsRouter = Router();

const SORTS = {
  newest: { publishedAt: -1, createdAt: -1 },
  price_asc: { displayPrice: 1, createdAt: -1 },
  price_desc: { displayPrice: -1, createdAt: -1 },
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notFound = () => new ApiError(404, 'LISTING_NOT_FOUND', "This listing doesn't exist or is no longer available.");

function serialize(listing, viewer) {
  const isOwner = Boolean(viewer && listing.seller?._id?.equals?.(viewer._id));
  return { ...listing.toJSON(), isOwner };
}

async function findOwnedListing(id, user) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const listing = await Listing.findOne({ _id: id, seller: user._id });
  if (!listing) throw notFound();
  return listing;
}

/**
 * Turns the ordered image references from the form into stored images, uploading new files.
 * Everything is checked before anything is uploaded, so a bad request uploads nothing.
 */
async function resolveImages({ refs, primaryIndex, files, existing, userId }) {
  const existingById = new Map(existing.map((image) => [image.publicId, image]));
  const seenIds = new Set();
  const usedFiles = new Set();

  for (const ref of refs) {
    if ('publicId' in ref) {
      if (!existingById.has(ref.publicId) || seenIds.has(ref.publicId)) {
        throw new ApiError(400, 'INVALID_IMAGES', 'One of the photos does not belong to this listing.');
      }
      seenIds.add(ref.publicId);
    } else {
      if (ref.newFileIndex >= files.length || usedFiles.has(ref.newFileIndex)) {
        throw new ApiError(400, 'INVALID_IMAGES', 'The uploaded photos did not match the listing photos.');
      }
      usedFiles.add(ref.newFileIndex);
    }
  }
  if (usedFiles.size !== files.length) {
    throw new ApiError(400, 'INVALID_IMAGES', 'The uploaded photos did not match the listing photos.');
  }

  const uploaded = await uploadListingImages(files, userId);
  const primary = primaryIndex < refs.length ? primaryIndex : 0;
  const images = refs.map((ref, index) => {
    const source = 'publicId' in ref ? existingById.get(ref.publicId) : uploaded[ref.newFileIndex];
    const { url, publicId, width, height } = source;
    return { url, publicId, width, height, isPrimary: index === primary };
  });
  const removedIds = existing.filter((image) => !seenIds.has(image.publicId)).map((image) => image.publicId);
  return { images, uploadedIds: uploaded.map((image) => image.publicId), removedIds };
}

// Public browse and search. Only active listings appear.
listingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listingQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid search.');
    const { q, type, category, campus, sort, page, limit } = parsed.data;

    const filter = { status: 'active' };
    if (type) filter.listingType = type === 'rent' ? 'for_rent' : 'for_sale';
    if (category) filter.category = category;
    if (campus) filter.campus = campus;
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: pattern }, { description: pattern }, { category: pattern }];
    }

    const [items, total] = await Promise.all([
      Listing.find(filter)
        .sort(SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('seller', SELLER_PUBLIC_FIELDS),
      Listing.countDocuments(filter),
    ]);

    res.json({ items: items.map((item) => serialize(item, null)), total, page, limit, hasMore: page * limit < total });
  }),
);

// Listing detail. Drafts and archived listings are visible only to their owner.
listingsRouter.get(
  '/:id',
  optionalUser,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
    const listing = await Listing.findById(req.params.id).populate('seller', SELLER_PUBLIC_FIELDS);
    if (!listing || !listing.seller) throw notFound();

    const result = serialize(listing, req.user);
    if (PRIVATE_STATUSES.includes(listing.status) && !result.isOwner) throw notFound();
    if (!result.isOwner && listing.status === 'active') {
      await Listing.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
    }
    res.json({ listing: result });
  }),
);

// Create a listing (multipart: `data` JSON + `photos` files).
listingsRouter.post(
  '/',
  requireAuth,
  loadCurrentUser,
  requireCompleteProfile,
  listingForm,
  validateBody(listingInputSchema),
  asyncHandler(async (req, res) => {
    const { images: refs, primaryIndex, ...fields } = req.body;
    const { images, uploadedIds } = await resolveImages({
      refs,
      primaryIndex,
      files: req.files ?? [],
      existing: [],
      userId: req.user.id,
    });

    try {
      const listing = await Listing.create({ ...fields, images, seller: req.user._id, campus: req.user.college });
      await listing.populate('seller', SELLER_PUBLIC_FIELDS);
      res.status(201).json({ listing: serialize(listing, req.user) });
    } catch (error) {
      await destroyImages(uploadedIds);
      throw error;
    }
  }),
);

// Replace a listing's details and photos. Photos removed from the listing are deleted from Cloudinary.
listingsRouter.put(
  '/:id',
  requireAuth,
  loadCurrentUser,
  requireCompleteProfile,
  listingForm,
  validateBody(listingInputSchema),
  asyncHandler(async (req, res) => {
    const listing = await findOwnedListing(req.params.id, req.user);
    const { images: refs, primaryIndex, ...fields } = req.body;
    const { images, uploadedIds, removedIds } = await resolveImages({
      refs,
      primaryIndex,
      files: req.files ?? [],
      existing: listing.images,
      userId: req.user.id,
    });

    try {
      listing.set({ ...fields, images, campus: req.user.college });
      await listing.save();
    } catch (error) {
      await destroyImages(uploadedIds);
      throw error;
    }
    await destroyImages(removedIds);
    await listing.populate('seller', SELLER_PUBLIC_FIELDS);
    res.json({ listing: serialize(listing, req.user) });
  }),
);

// Seller Hub status actions: mark sold, rented, exchanged, archived, or back to active.
listingsRouter.patch(
  '/:id/status',
  requireAuth,
  loadCurrentUser,
  validateBody(listingStatusSchema),
  asyncHandler(async (req, res) => {
    const listing = await findOwnedListing(req.params.id, req.user);
    if (req.body.status === 'active' && !listing.publishedAt) {
      throw new ApiError(400, 'NOT_PUBLISHED', 'Open the listing and publish it to make it active.');
    }
    listing.status = req.body.status;
    await listing.save();
    await listing.populate('seller', SELLER_PUBLIC_FIELDS);
    res.json({ listing: serialize(listing, req.user) });
  }),
);

listingsRouter.delete(
  '/:id',
  requireAuth,
  loadCurrentUser,
  asyncHandler(async (req, res) => {
    const listing = await findOwnedListing(req.params.id, req.user);
    await listing.deleteOne();
    await SavedListing.deleteMany({ listing: listing._id });
    await destroyImages(listing.images.map((image) => image.publicId));
    res.status(204).end();
  }),
);
