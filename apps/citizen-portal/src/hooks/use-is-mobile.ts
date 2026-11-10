"use client"

import { useEffect, useState } from "react"

/**
 * Mobile breakpoint shared with the inbox CSS (`@media (max-width: 1023px)`
 * in `unified-inbox-table.module.css` / `inbox-pagination.module.css`).
 * Desktop rules use `min-width: 1024px`, the DS `lg` breakpoint where the
 * header swaps the Menu button for the desktop items.
 * Kept in sync so the JS-driven data path (mobile infinite scroll vs desktop
 * pagination) flips at the exact same width the layout swaps between the
 * mobile card list and the desktop table.
 */
export const MOBILE_MEDIA_QUERY = "(max-width: 1023px)"

/**
 * Reports whether a media query matches.
 *
 * Defaults to `false` (desktop-first) on the server and the first client
 * render so SSR markup is stable and hydration never mismatches; the real
 * value is resolved from `matchMedia` in an effect and updated on resize.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }

    const mediaQueryList = window.matchMedia(query)
    const update = () => setMatches(mediaQueryList.matches)

    update()
    mediaQueryList.addEventListener("change", update)
    return () => mediaQueryList.removeEventListener("change", update)
  }, [query])

  return matches
}

/** Reports whether the viewport is at or below the mobile breakpoint. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY)
}
