import type { Zone } from "@/util/get-zone-from-path"
import { env } from "../env/env.client.ts"

/**
 * Build-time deployment-topology flags for the consolidated
 * citizen-portal (AB#39580).
 *
 * The unified app serves the `messages`, `profile` and `dashboard` zones
 * from one static export. A future adopter may want to deploy a reduced
 * subset (e.g. MessagingIE without Dashboard, as in the Department of
 * Education deployment) without exposing UI elements that imply the
 * presence of building blocks that are not deployed.
 *
 * These are *build-time* `NEXT_PUBLIC_*` flags (baked into the bundle),
 * not runtime Unleash toggles: deployment topology is decided at build /
 * deploy time, never per-user. Every flag defaults to `true`, so all
 * current deployments are unchanged. Runtime, user-targeted toggles
 * (e.g. `submission-linking`) live in `feature-flags-provider.tsx`.
 *
 * Profile is intentionally not flaggable — every building block requires
 * Profile, so the profile zone is always enabled.
 */

/**
 * Whether a given citizen-portal zone is part of this deployment.
 *
 * `profile` is always enabled (all building blocks require Profile).
 * `messages` / `dashboard` are gated by their build-time flags.
 */
export function isZoneEnabled(zone: Zone): boolean {
  switch (zone) {
    case "profile":
      return true
    case "messages":
      return env.NEXT_PUBLIC_ENABLE_MESSAGING
    case "dashboard":
      return env.NEXT_PUBLIC_ENABLE_DASHBOARD
    default: {
      const _exhaustive: never = zone
      return _exhaustive
    }
  }
}

/**
 * Whether the Journey-Builder integration is part of this deployment.
 *
 * Gates the Journey-Builder sign-out fan-out today, and is the build-time
 * switch for any future submission-linked surface that is structurally
 * tied to a Journey-Builder deployment.
 */
export function isJourneyIntegrationEnabled(): boolean {
  return env.NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION
}

/**
 * Whether the Payments integration is part of this deployment. Gates the
 * Payments sign-out fan-out.
 */
export function isPaymentsIntegrationEnabled(): boolean {
  return env.NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION
}

/**
 * Whether the Forms integration is part of this deployment.
 */
export function isFormsIntegrationEnabled(): boolean {
  return env.NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION
}

/**
 * Whether the Life Events Accelerator (LEA) experience is enabled for this
 * build (AB#40267).
 *
 * A build-time switch (baked into the static export) that gates the LEA
 * surfaces — the new dashboard and the link to an application submission
 * from the message view. Enabled in dev and uat, disabled in production
 * (which keeps the default, non-LEA version). Defaults `false` so any
 * unconfigured build ships LEA off.
 */
export function isLeaEnabled(): boolean {
  return env.NEXT_PUBLIC_ENABLE_LEA
}

/**
 * Whether the citizen-portal message-folders feature is enabled for this
 * build (AB#42582).
 *
 * A build-time switch (baked into the static export) that gates the folder
 * sidebar, move actions, and the mobile folder panel. Defaults `false` so
 * any unconfigured build ships folders off.
 */
export function isFoldersEnabled(): boolean {
  return env.NEXT_PUBLIC_ENABLE_FOLDERS
}

/**
 * Fallback order used when a requested landing zone is disabled.
 * Dashboard is the canonical landing surface so it is preferred when
 * shipped; messages is next; profile is the terminal fallback because it
 * is always enabled. With every flag at its default this makes
 * `getEnabledLandingZone("dashboard")` return `"dashboard"`, preserving
 * the pre-AB#39580 behaviour exactly.
 */
const LANDING_FALLBACK_ORDER: readonly Zone[] = [
  "dashboard",
  "messages",
  "profile",
]

/**
 * Resolve the zone a `/{locale}/` (or otherwise zone-less) landing should
 * redirect to, honouring the topology flags.
 *
 * If the requested zone is enabled it wins. Otherwise we fall back to the
 * first enabled zone in `LANDING_FALLBACK_ORDER`, guaranteeing we never
 * land a user on a zone that this deployment does not ship.
 */
export function getEnabledLandingZone(requestedZone: Zone): Zone {
  if (isZoneEnabled(requestedZone)) return requestedZone
  for (const zone of LANDING_FALLBACK_ORDER) {
    if (isZoneEnabled(zone)) return zone
  }
  return "profile"
}
