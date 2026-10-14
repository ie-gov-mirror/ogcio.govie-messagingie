import { beforeEach, describe, expect, it, vi } from "vitest"

// feature-config reads the build-time flags from `@/env/env.client` at
// call time, so a mutable mock env lets each spec pin a deployment
// topology without `vi.resetModules()` gymnastics. Hoisted so the
// `vi.mock` factory can reference it.
const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_ENABLE_DASHBOARD: true,
    NEXT_PUBLIC_ENABLE_MESSAGING: true,
    NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION: true,
    NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION: true,
    NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION: true,
    // LEA defaults off (prod keeps the default version); dev/uat turn it on.
    NEXT_PUBLIC_ENABLE_LEA: false,
    NEXT_PUBLIC_ENABLE_FOLDERS: false,
  },
}))

vi.mock("@/env/env.client", () => ({ env: mocks.env }))

import {
  getEnabledLandingZone,
  isFoldersEnabled,
  isFormsIntegrationEnabled,
  isJourneyIntegrationEnabled,
  isLeaEnabled,
  isPaymentsIntegrationEnabled,
  isZoneEnabled,
} from "@/lib/feature-config"

function setTopology(flags: Partial<typeof mocks.env>) {
  Object.assign(mocks.env, flags)
}

describe("feature-config", () => {
  beforeEach(() => {
    // Reset to the all-enabled default that every current deployment ships.
    setTopology({
      NEXT_PUBLIC_ENABLE_DASHBOARD: true,
      NEXT_PUBLIC_ENABLE_MESSAGING: true,
      NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION: true,
      NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION: true,
      NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION: true,
      // LEA is env-specific, not a topology flag; reset to its default (off).
      NEXT_PUBLIC_ENABLE_LEA: false,
      NEXT_PUBLIC_ENABLE_FOLDERS: false,
    })
  })

  describe("isZoneEnabled", () => {
    it("always enables the profile zone regardless of flags", () => {
      // Profile is load-bearing for every building block, so it can never
      // be flagged off — even with the (non-existent) messaging/dashboard
      // flags both false.
      setTopology({
        NEXT_PUBLIC_ENABLE_DASHBOARD: false,
        NEXT_PUBLIC_ENABLE_MESSAGING: false,
      })
      expect(isZoneEnabled("profile")).toBe(true)
    })

    it.each([
      [true, true],
      [false, false],
    ])(
      "maps the messages zone to NEXT_PUBLIC_ENABLE_MESSAGING=%s",
      (flag, expected) => {
        setTopology({ NEXT_PUBLIC_ENABLE_MESSAGING: flag })
        expect(isZoneEnabled("messages")).toBe(expected)
      },
    )

    it.each([
      [true, true],
      [false, false],
    ])(
      "maps the dashboard zone to NEXT_PUBLIC_ENABLE_DASHBOARD=%s",
      (flag, expected) => {
        setTopology({ NEXT_PUBLIC_ENABLE_DASHBOARD: flag })
        expect(isZoneEnabled("dashboard")).toBe(expected)
      },
    )
  })

  describe("cross-block integration flags", () => {
    it("reflects the journey flag", () => {
      expect(isJourneyIntegrationEnabled()).toBe(true)
      setTopology({ NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION: false })
      expect(isJourneyIntegrationEnabled()).toBe(false)
    })

    it("reflects the payments flag", () => {
      expect(isPaymentsIntegrationEnabled()).toBe(true)
      setTopology({ NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION: false })
      expect(isPaymentsIntegrationEnabled()).toBe(false)
    })

    it("reflects the forms flag", () => {
      expect(isFormsIntegrationEnabled()).toBe(true)
      setTopology({ NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION: false })
      expect(isFormsIntegrationEnabled()).toBe(false)
    })
  })

  describe("isLeaEnabled", () => {
    it("defaults off so prod keeps the default (non-LEA) version", () => {
      expect(isLeaEnabled()).toBe(false)
    })

    it("reflects NEXT_PUBLIC_ENABLE_LEA when turned on (dev/uat)", () => {
      setTopology({ NEXT_PUBLIC_ENABLE_LEA: true })
      expect(isLeaEnabled()).toBe(true)
    })
  })

  describe("isFoldersEnabled", () => {
    it("defaults off so folders stay hidden until explicitly enabled", () => {
      expect(isFoldersEnabled()).toBe(false)
    })

    it("reflects NEXT_PUBLIC_ENABLE_FOLDERS when turned on", () => {
      setTopology({ NEXT_PUBLIC_ENABLE_FOLDERS: true })
      expect(isFoldersEnabled()).toBe(true)
    })
  })

  describe("getEnabledLandingZone", () => {
    it("returns the requested zone when it is enabled", () => {
      expect(getEnabledLandingZone("dashboard")).toBe("dashboard")
      expect(getEnabledLandingZone("messages")).toBe("messages")
      expect(getEnabledLandingZone("profile")).toBe("profile")
    })

    it("preserves pre-AB#39580 behaviour: dashboard is the default landing", () => {
      // With every flag at its default the canonical landing is dashboard,
      // exactly as before the topology flags existed.
      expect(getEnabledLandingZone("dashboard")).toBe("dashboard")
    })

    it("falls back dashboard -> messages when dashboard is disabled", () => {
      setTopology({ NEXT_PUBLIC_ENABLE_DASHBOARD: false })
      expect(getEnabledLandingZone("dashboard")).toBe("messages")
    })

    it("falls back to profile when both dashboard and messages are disabled", () => {
      setTopology({
        NEXT_PUBLIC_ENABLE_DASHBOARD: false,
        NEXT_PUBLIC_ENABLE_MESSAGING: false,
      })
      expect(getEnabledLandingZone("dashboard")).toBe("profile")
      // A disabled messages request also lands on profile here.
      expect(getEnabledLandingZone("messages")).toBe("profile")
    })

    it("steers a disabled messages request to dashboard when dashboard is shipped", () => {
      setTopology({ NEXT_PUBLIC_ENABLE_MESSAGING: false })
      expect(getEnabledLandingZone("messages")).toBe("dashboard")
    })

    it("never returns a disabled zone", () => {
      // Profile-only deployment: whatever is requested, only profile is a
      // valid destination.
      setTopology({
        NEXT_PUBLIC_ENABLE_DASHBOARD: false,
        NEXT_PUBLIC_ENABLE_MESSAGING: false,
      })
      for (const zone of ["dashboard", "messages", "profile"] as const) {
        expect(isZoneEnabled(getEnabledLandingZone(zone))).toBe(true)
      }
    })
  })
})
