// Mirrors the server rule: an allowed domain also admits its subdomains. The server is the authority.
export function isEmailAllowed(email: string, allowedDomains: string[]): boolean {
  if (!allowedDomains.length) return true
  const domain = email.trim().split("@").pop()?.toLowerCase() ?? ""
  return allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
}

export function formatDomainList(domains: string[]): string {
  return domains.map((domain) => `@${domain}`).join(", ")
}
