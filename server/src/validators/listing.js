import { z } from 'zod';
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  LISTING_STATUSES,
  LISTING_TYPES,
  RENTAL_DURATIONS,
} from '../models/Listing.js';

export const MAX_LISTING_PHOTOS = 10;

const text = (max) => z.string().trim().max(max).optional().default('');
const money = z
  .number({ message: 'Enter a valid amount.' })
  .min(0, 'Enter a valid amount.')
  .max(10_000_000, 'That amount is too large.')
  .nullable()
  .optional()
  .default(null);

// Each photo in display order: an image already on the listing, or a newly uploaded file.
const imageRef = z.union([
  z.object({ publicId: z.string().min(1) }).strict(),
  z.object({ newFileIndex: z.number().int().min(0) }).strict(),
]);

/** Full listing body for create and update. Drafts need only a title; publishing needs everything. */
export const listingInputSchema = z
  .object({
    title: text(120),
    description: text(3000),
    category: z.enum([...LISTING_CATEGORIES, ''], { message: 'Choose a category.' }).optional().default(''),
    condition: z.enum([...LISTING_CONDITIONS, ''], { message: 'Select the condition.' }).optional().default(''),
    listingType: z.enum(LISTING_TYPES).optional().default('for_sale'),
    price: money,
    rentalPrice: money,
    rentalDuration: z.enum(RENTAL_DURATIONS).optional().default('Per day'),
    availability: text(200),
    exchangeFor: text(300),
    pickupLocation: text(200),
    pickupInstructions: text(1000),
    status: z.enum(['active', 'draft']).optional().default('draft'),
    images: z.array(imageRef).max(MAX_LISTING_PHOTOS, `You can add up to ${MAX_LISTING_PHOTOS} photos.`).optional().default([]),
    primaryIndex: z.number().int().min(0).optional().default(0),
  })
  .strict()
  .superRefine((data, ctx) => {
    const need = (ok, field, message) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [field], message });
    };
    need(data.title.length > 0, 'title', 'Add a product title.');
    if (data.status !== 'active') return;
    need(data.description.length > 0, 'description', 'Write a short description.');
    need(data.category !== '', 'category', 'Choose a category.');
    need(data.condition !== '', 'condition', 'Select the condition.');
    need(data.pickupLocation.length > 0, 'pickupLocation', 'Add a meetup preference.');
    if (data.listingType === 'for_sale') need(data.price > 0, 'price', 'Enter a valid price in INR.');
    else need(data.rentalPrice > 0, 'rentalPrice', 'Add a rental rate.');
    need(data.images.length > 0, 'images', 'Add at least one image before publishing.');
  });

export const listingStatusSchema = z
  .object({ status: z.enum(LISTING_STATUSES.filter((status) => status !== 'draft'), { message: 'Choose a valid status.' }) })
  .strict();

export const listingQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['sale', 'rent']).optional(),
  category: z.enum(LISTING_CATEGORIES).optional(),
  campus: z.string().trim().max(150).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(24),
});

export const myListingsQuerySchema = z.object({
  status: z.enum(LISTING_STATUSES).optional(),
});
