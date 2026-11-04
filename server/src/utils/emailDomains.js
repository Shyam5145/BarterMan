import { COLLEGES_BY_DOMAIN } from '../config/colleges.js';
import { env } from '../config/env.js';

/** The college for this email's domain (or a parent domain), or '' when unknown. */
export function collegeForEmail(email = '') {
  const domain = email.split('@').pop()?.toLowerCase() ?? '';
  const match = Object.keys(COLLEGES_BY_DOMAIN).find((known) => domain === known || domain.endsWith(`.${known}`));
  return match ? COLLEGES_BY_DOMAIN[match] : '';
}

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
