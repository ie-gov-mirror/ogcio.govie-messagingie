/**
 * Cross-zone primitives for the consolidated citizen-portal.
 *
 * Pure, framework-free helpers that the SAG provider, useCrossZoneLink hook
 * and the zone-host env schema all build on top of. Keeping them React-free
 * makes them trivially unit-testable in node.
 */

export type Zone = "messages" | "profile" | "dashboard"

export const ZONES = ["messages", "profile", "dashboard"] as const

/**
 * Resolved zone → fully-qualified base URL map. The values are normalised
 * (without a trailing `/`) by `getCrossZoneHref` so consumers don't have to
 * care whether the env var was set with or without one.
 */
export interface ZoneHosts {
  messages: string
  profile: string
  dashboard: string
}

/**
 * Build a fully-qualified URL for a target zone + path.
 *
 * Pure function — no React, no env coupling — so it can be exercised across
 * all 4 deploy environments (local / dev / uat / prod) by passing a different
 * `ZoneHosts` map.
 */
export function getCrossZoneHref(
  zone: Zone,
  path: string,
  hosts: ZoneHosts,
): string {
  const base = hosts[zone].replace(/\/+$/, "")
  const normalisedPath = path.startsWith("/") ? path : `/${path}`
  return `${base}${normalisedPath}`
}

/**
 * Extract the parent domain that the SAG session cookie should be scoped to
 * so a session set on one citizen-portal zone (messages / profile / dashboard)
 * is readable by sibling subdomains.
 *
 * Limited to an explicit zone-prefix allowlist so we never leak the scope
 * to an unrelated host.
 *
 * Examples:
 *   localhost                            → undefined
 *   messaging.local.test                 → .local.test
 *   profile.local.test                   → .local.test
 *   messaging.dev.services.gov.ie        → .dev.services.gov.ie
 *   profile.uat.services.gov.ie          → .uat.services.gov.ie
 *   dashboard.services.gov.ie            → .services.gov.ie
 *   random.example.com                   → undefined
 */
export function getSharedParentDomain(hostname: string): string | undefined {
  if (hostname === "localhost") return undefined
  if (!/^messaging\.|^profile\.|^dashboard\.|\.local\.test$/.test(hostname)) {
    return undefined
  }
  const parts = hostname.split(".")
  if (parts.length < 2) return undefined
  return `.${parts.slice(1).join(".")}`
}
