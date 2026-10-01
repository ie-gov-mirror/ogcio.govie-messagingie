import { AVAILABLE_LOCALES } from "@/const"
import { getEnabledLandingZone } from "@/lib/feature-config"

/**
 * Citizen-portal zones.
 *
 * The unified app serves all three from one static export. Nginx (Phase
 * D) maps each public hostname to the matching `/[locale]/...` entry,
 * but at the React layer the active zone has to be derived from the
 * current path — there is no hostname signal inside the bundle.
 *
 * Why a derived enum rather than a server constant: the alternative is
 * `process.env.zone` baked at build time (what the zones did pre-B2),
 * which breaks the moment one static export serves multiple zones.
 */
export type Zone = "messages" | "profile" | "dashboard"

/**
 * Locale-prefixed route segments and the zone that owns them.
 *
 * The nginx `$canonical_host` map in `docker/nginx.conf.template` must mirror
 * this table exactly: a segment missing there is served by every hostname, so
 * the shell mounts one zone's `sagAppName` on a foreign origin and every
 * gateway call 401s. `test/lib/nginx-canonical-host.test.ts` enforces it.
 */
export const ZONE_BY_FIRST_SEGMENT: Record<string, Zone> = {
  messages: "messages",
  "secure-messages": "messages",
  "whats-new": "messages",
  "my-profile": "profile",
  "accessibility-statement": "profile",
  "contact-support": "profile",
  "cookie-policy": "profile",
  "wrong-account-error": "profile",
  "wrong-login-method-error": "profile",
  "global-signout": "profile",
  "my-dashboard": "dashboard",
  "my-submissions": "dashboard",
  discovery: "dashboard",
}

/**
 * Resolves the active zone from a route pathname.
 *
 * Examples:
 *   /en/messages              -> "messages"
 *   /en/messages/secure-...   -> "messages"
 *   /ga/my-profile            -> "profile"
 *   /en/accessibility-...     -> "profile"  (public profile-owned page)
 *   /en/my-dashboard          -> "dashboard"
 *   /en                       -> "dashboard" (locale root → dashboard home)
 *   /onboarding               -> "profile"  (no-locale profile page)
 *
 * Pathnames that don't match a known zone segment fall back to the
 * enabled landing zone (dashboard when shipped, otherwise the first
 * enabled fallback) — the dashboard is the canonical landing surface
 * but may be absent in a reduced standalone deployment (AB#39580).
 */
export function getZoneFromPath(pathname: string): Zone {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return getEnabledLandingZone("dashboard")

  // First segment is the locale on /{locale}/{route}/... paths; the
  // route segment we care about is at index 1. For paths that skip the
  // locale (e.g. /onboarding, /api/clear-session, /post-global-signout)
  // the route segment is at index 0.
  const firstIsLocale = (AVAILABLE_LOCALES as readonly string[]).includes(
    segments[0],
  )
  const routeSegment = firstIsLocale ? (segments[1] ?? "") : segments[0]

  // Profile-owned no-locale routes.
  if (
    routeSegment === "onboarding" ||
    routeSegment === "post-global-signout" ||
    routeSegment === "global-signout" ||
    routeSegment === "wrong-account-error" ||
    routeSegment === "wrong-login-method-error" ||
    routeSegment === "api"
  ) {
    return "profile"
  }

  return (
    ZONE_BY_FIRST_SEGMENT[routeSegment] ?? getEnabledLandingZone("dashboard")
  )
}
