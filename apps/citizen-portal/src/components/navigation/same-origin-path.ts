/**
 * Path to client-navigate when `href` is already on `currentOrigin`.
 * Cross-origin hrefs return null: a different zone host cannot share
 * the mounted shell, so the caller keeps a full document load.
 */
export function sameOriginPath(
  href: string,
  currentOrigin: string,
): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href
  try {
    const url = new URL(href)
    if (url.origin !== currentOrigin) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
