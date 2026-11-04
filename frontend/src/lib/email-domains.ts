// Mirrors the server rule: an allowed domain also admits its subdomains. The server is the authority.
export function isEmailAllowed(email: string, allowedDomains: string[]): boolean {
  if (!allowedDomains.length) return true
  const domain = email.trim().split("@").pop()?.toLowerCase() ?? ""
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
}

export function formatDomainList(domains: string[]): string {
  return domains.map((domain) => `@${domain}`).join(", ")
}

/** The college for this email's domain (or a parent domain), or "" when the domain isn't known. */
export function collegeForEmail(email: string, collegesByDomain: Record<string, string>): string {
  const domain = email.trim().split("@").pop()?.toLowerCase() ?? ""
  const match = Object.keys(collegesByDomain).find((known) => domain === known || domain.endsWith(`.${known}`))
  return match ? collegesByDomain[match] : ""
}
