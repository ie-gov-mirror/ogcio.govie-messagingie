import { beforeEach, describe, expect, it, vi } from "vitest"

// `getZoneFromPath` now resolves its unmatched-path fallback through
// `getEnabledLandingZone` (AB#39580). Mock it so the existing fallback
// assertions stay deterministic (default `dashboard`) and a dedicated
// block can simulate a deployment where dashboard is dropped.
const landingZone = vi.hoisted(() => ({
  value: "dashboard" as "messages" | "profile" | "dashboard",
}))
vi.mock("@/lib/feature-config", () => ({
  getEnabledLandingZone: () => landingZone.value,
  isZoneEnabled: () => true,
}))

import { getZoneFromPath } from "@/util/get-zone-from-path"

beforeEach(() => {
  landingZone.value = "dashboard"
})

/**
 * Zone routing is the keystone of the consolidation: every shared
 * component decides what to render based on the active zone, and the
 * SAG audience itself is keyed off `ZONE_CONFIG[zone].sagAppName`. A
 * regression here mis-targets the auth cookie and silently breaks
 * cross-zone sessions, so this suite locks down every owned URI prefix
 * (en + ga + locale-less) plus the dashboard fallback.
 */
describe("getZoneFromPath", () => {
  describe("messages zone", () => {
    it.each([
      "/en/messages",
      "/ga/messages",
      "/en/messages/some-message-id",
      "/en/messages?search=foo",
      "/ga/secure-messages/abc",
      "/en/secure-messages",
    ])("resolves %s to 'messages'", (path) => {
      // URLs reaching getZoneFromPath always arrive without a query
      // string (Next.js separates pathname from search params), but the
      // helper is defensive enough to handle the raw URL too — pin
      // both shapes so a future "strip query first" refactor stays
      // behaviour-preserving.
      expect(getZoneFromPath(path.split("?")[0])).toBe("messages")
    })
  })

  describe("profile zone", () => {
    it.each([
      "/en/my-profile",
      "/ga/my-profile",
      "/en/my-profile/edit",
      "/en/accessibility-statement",
      "/ga/accessibility-statement",
      "/en/contact-support",
      "/en/cookie-policy",
      "/en/wrong-account-error",
      "/en/wrong-login-method-error",
      "/en/global-signout",
    ])("resolves %s to 'profile'", (path) => {
      expect(getZoneFromPath(path)).toBe("profile")
    })

    // Locale-less profile-owned routes — these are the ones nginx must
    // canonicalise back to profile.local.test/profile.dev.* via the
    // canonical_host map; if getZoneFromPath disagrees with that table
    // the SSR + 301 stop agreeing and we get a redirect loop.
    it.each([
      "/onboarding",
      "/post-global-signout",
      "/global-signout",
      "/wrong-account-error",
      "/wrong-login-method-error",
      "/api/clear-session",
      "/api/application-signout",
    ])("resolves locale-less %s to 'profile'", (path) => {
      expect(getZoneFromPath(path)).toBe("profile")
    })
  })

  describe("dashboard zone", () => {
    it.each([
      "/en/my-dashboard",
      "/ga/my-dashboard",
      "/en/my-dashboard/widgets",
      "/en/my-submissions",
      "/ga/my-submissions",
      "/en/my-submissions?id=SCH-2025-073296",
    ])("resolves %s to 'dashboard'", (path) => {
      expect(getZoneFromPath(path)).toBe("dashboard")
    })

    // The locale root is intentionally dashboard — the landing page
    // on `/en/` / `/ga/` is the dashboard home. Changing this means
    // changing locale-landing-redirect.tsx + onboarding flow.
    it.each(["/en", "/ga", "/"])(
      "resolves locale root %s to 'dashboard'",
      (path) => {
        expect(getZoneFromPath(path)).toBe("dashboard")
      },
    )
  })

  describe("unknown segments", () => {
    it.each([
      "/en/this-route-does-not-exist",
      "/ga/random",
      "/en/messages-typo",
      "/en/profile",
    ])("falls back to 'dashboard' for unknown %s", (path) => {
      // The fallback is intentional: nginx will 404 anything that
      // isn't in the static export, and the dashboard zone is the
      // safest place to bounce to because every authenticated user
      // has a dashboard root. Profile-only or messages-only fallback
      // would mis-target the SAG audience for users that only have
      // the bouncing-target's role.
      expect(getZoneFromPath(path)).toBe("dashboard")
    })

    it("falls back to 'dashboard' for the bare-locale empty-segments path", () => {
      // `path.split('/').filter(Boolean)` reduces `''` and `'/'` to
      // `[]` — the explicit branch keeps the helper total.
      expect(getZoneFromPath("")).toBe("dashboard")
    })
  })

  describe("topology-aware fallback (AB#39580)", () => {
    // When dashboard is dropped from the deployment, the unmatched-path
    // and locale-root fallback must steer to the first enabled landing
    // zone instead of the (absent) dashboard. Explicit segment matches
    // are unaffected — only the fallback changes.
    beforeEach(() => {
      landingZone.value = "messages"
    })

    it.each(["/en", "/ga", "/", ""])(
      "resolves locale root %s to the enabled landing zone, not dashboard",
      (path) => {
        expect(getZoneFromPath(path)).toBe("messages")
      },
    )

    it.each(["/en/this-route-does-not-exist", "/ga/random"])(
      "resolves unknown %s to the enabled landing zone",
      (path) => {
        expect(getZoneFromPath(path)).toBe("messages")
      },
    )

    it("still resolves explicit dashboard paths to 'dashboard'", () => {
      // The route segment match is independent of the fallback target —
      // a deep link is honoured even if the my-dashboard route itself
      // later redirects away when the zone is disabled.
      expect(getZoneFromPath("/en/my-dashboard")).toBe("dashboard")
    })
  })

  describe("locale handling", () => {
    it("treats the first segment as a route when it isn't a known locale", () => {
      // Defensive: a future locale rename ("ga-IE") or a path that
      // accidentally drops the locale prefix shouldn't crash the
      // helper. Here "messages" sits at index 0 and must still
      // resolve to the messages zone.
      expect(getZoneFromPath("/messages")).toBe("messages")
      expect(getZoneFromPath("/my-profile")).toBe("profile")
      expect(getZoneFromPath("/my-dashboard")).toBe("dashboard")
    })
  })
})
