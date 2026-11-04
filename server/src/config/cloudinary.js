import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

// Cloudinary stores the image files; MongoDB stores only their URLs and public IDs.
cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export { cloudinary };
