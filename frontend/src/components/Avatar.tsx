/** Profile photo, or the first letter of the name when there is no photo. */
export function Avatar({ src, name, className = "", alt = "" }: { src?: string; name: string; className?: string; alt?: string }) {
  if (src) return <img className={className || undefined} src={src} alt={alt} referrerPolicy="no-referrer" />
  return <span className={`avatar-fallback ${className}`.trim()} aria-hidden="true">{(name.trim()[0] ?? "?").toUpperCase()}</span>
}
