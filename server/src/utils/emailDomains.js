import { env } from '../config/env.js';

// A domain on the allow-list also admits its subdomains (pes.edu admits stu.pes.edu).
export function isEmailDomainAllowed(email) {
  if (!env.allowedEmailDomains.length) return true;
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  return env.allowedEmailDomains.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
  );
}

export function describeAllowedDomains() {
  return env.allowedEmailDomains.map((domain) => `@${domain}`).join(', ');
}
