import multer from 'multer';
import { MAX_LISTING_PHOTOS } from '../validators/listing.js';
import { ApiError } from '../utils/http.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Files are kept in memory only long enough to stream them on to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_LISTING_PHOTOS, fields: 5, fieldSize: 100 * 1024 },
  fileFilter(_req, file, callback) {
    if (file.mimetype.startsWith('image/')) return callback(null, true);
    return callback(new ApiError(400, 'INVALID_FILE', 'Only image files can be uploaded.'));
  },
});

const UPLOAD_MESSAGES = {
  LIMIT_FILE_SIZE: 'Each photo must be 5MB or smaller.',
  LIMIT_FILE_COUNT: `You can upload up to ${MAX_LISTING_PHOTOS} photos.`,
  LIMIT_UNEXPECTED_FILE: `You can upload up to ${MAX_LISTING_PHOTOS} photos.`,
};

/** Accepts a multipart listing form: a `data` JSON field plus up to 10 `photos` files. */
export function listingForm(req, res, next) {
  upload.array('photos', MAX_LISTING_PHOTOS)(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return next(new ApiError(400, 'UPLOAD_ERROR', UPLOAD_MESSAGES[error.code] ?? 'The upload could not be processed.'));
    }
    if (error) return next(error);
    try {
      req.body = typeof req.body?.data === 'string' ? JSON.parse(req.body.data) : {};
    } catch {
      return next(new ApiError(400, 'INVALID_JSON', 'Listing data is not valid JSON.'));
    }
    return next();
  });
}
