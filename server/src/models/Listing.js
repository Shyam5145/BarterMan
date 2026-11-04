import mongoose from 'mongoose';

// These option lists match the Sell form in the frontend.
export const LISTING_CATEGORIES = [
  'Electronics',
  'Books & Study Materials',
  'Furniture',
  'Fashion',
  'Cycles & Vehicles',
  'Sports & Fitness',
  'Home & Dorm Essentials',
  'Other',
];
export const LISTING_CONDITIONS = ['Like New', 'Very Good', 'Good', 'Fair'];
export const RENTAL_DURATIONS = ['Per day', 'Per week', 'Per month', 'Flexible'];
export const LISTING_TYPES = ['for_sale', 'for_rent'];
export const LISTING_STATUSES = ['active', 'draft', 'pending', 'sold', 'rented', 'exchanged', 'archived'];
/** Statuses only the owner can see. */
export const PRIVATE_STATUSES = ['draft', 'archived'];
/** Public seller fields included with a listing (never email or phone). */
export const SELLER_PUBLIC_FIELDS = 'name avatarUrl college course year';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: Number,
    height: Number,
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

// Drafts may be incomplete, so field rules beyond types are enforced by the request validators.
const listingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 3000, default: '' },
    category: { type: String, enum: [...LISTING_CATEGORIES, ''], default: '' },
    condition: { type: String, enum: [...LISTING_CONDITIONS, ''], default: '' },
    listingType: { type: String, enum: LISTING_TYPES, default: 'for_sale' },
    price: { type: Number, min: 0, default: null },
    rentalPrice: { type: Number, min: 0, default: null },
    rentalDuration: { type: String, enum: RENTAL_DURATIONS, default: 'Per day' },
    availability: { type: String, trim: true, maxlength: 200, default: '' },
    exchangeFor: { type: String, trim: true, maxlength: 300, default: '' },
    campus: { type: String, trim: true, maxlength: 150, default: '' },
    pickupLocation: { type: String, trim: true, maxlength: 200, default: '' },
    pickupInstructions: { type: String, trim: true, maxlength: 1000, default: '' },
    images: { type: [imageSchema], default: [] },
    status: { type: String, enum: LISTING_STATUSES, default: 'draft' },
    /** Sale price, or rental rate for rentals. Used for price sorting. */
    displayPrice: { type: Number, default: null },
    views: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

listingSchema.index({ status: 1, createdAt: -1 });
listingSchema.index({ status: 1, category: 1, createdAt: -1 });
listingSchema.index({ status: 1, displayPrice: 1 });
listingSchema.index({ seller: 1, updatedAt: -1 });

listingSchema.pre('validate', function setDerivedFields() {
  this.displayPrice = this.listingType === 'for_rent' ? this.rentalPrice : this.price;
  if (this.status === 'active' && !this.publishedAt) this.publishedAt = new Date();
});

listingSchema.set('toJSON', {
  virtuals: false,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.displayPrice;
    if (ret.seller && !ret.seller.id) ret.seller = { id: String(ret.seller._id ?? ret.seller) };
    // Populated seller is a partial user; its profile-completion virtual would be misleading.
    if (ret.seller) delete ret.seller.isProfileComplete;
    return ret;
  },
});

export const Listing = mongoose.model('Listing', listingSchema);
