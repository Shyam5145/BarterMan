import { cloudinary } from '../config/cloudinary.js';
import { ApiError } from '../utils/http.js';

const LISTING_FOLDER = 'barterman/listings';

function uploadBuffer(buffer, userId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${LISTING_FOLDER}/${userId}`,
        resource_type: 'image',
        // Cap stored size so phone photos don't use up the free plan.
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Empty Cloudinary response'));
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });
}

// Uploads all files or none: if any upload fails, the ones that succeeded are deleted again.
export async function uploadListingImages(files, userId) {
  if (!files.length) return [];
  const results = await Promise.allSettled(files.map((file) => uploadBuffer(file.buffer, userId)));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) {
    const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value.publicId);
    await destroyImages(uploaded);
    console.error('Cloudinary upload failed:', failed[0].reason?.message ?? failed[0].reason);
    throw new ApiError(502, 'IMAGE_UPLOAD_FAILED', "We couldn't upload your photos. Please try again.");
  }
  return results.map((result) => result.value);
}

// Best effort: a failed delete is logged but never fails the request.
export async function destroyImages(publicIds) {
  if (!publicIds.length) return;
  const results = await Promise.allSettled(
    publicIds.map((publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image' })),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`Could not delete Cloudinary image ${publicIds[index]}:`, result.reason);
  });
}
