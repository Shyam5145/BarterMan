import 'dotenv/config';

const missing = [];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) missing.push(name);
  return value ?? '';
}

function list(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  clientUrls: list(process.env.CLIENT_URL || 'http://localhost:8443'),
  mongodbUri: required('MONGODB_URI'),
  firebaseProjectId: required('FIREBASE_PROJECT_ID'),
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || '',
  cloudinary: {
    cloudName: required('CLOUDINARY_CLOUD_NAME'),
    apiKey: required('CLOUDINARY_API_KEY'),
    apiSecret: required('CLOUDINARY_API_SECRET'),
  },
  // Optional DNS resolvers for Atlas SRV lookups when the system resolver refuses them.
  dnsServers: list(process.env.DNS_SERVERS),
  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS).map((domain) =>
    domain.toLowerCase().replace(/^@/, ''),
  ),
};

if (missing.length) {
  console.error(
    `Missing required environment variable(s): ${missing.join(', ')}.\n` +
      'Copy server/.env.example to server/.env and fill them in.',
  );
  process.exit(1);
}

if (!env.allowedEmailDomains.length) {
  console.warn(
    'ALLOWED_EMAIL_DOMAINS is empty, so any verified email address can sign in. ' +
      'Set it in server/.env to restrict sign-in to college domains.',
  );
}
