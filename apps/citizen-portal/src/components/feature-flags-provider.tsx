"use client"

import { useAuth } from "@ogcio/sag-client/react"
import {
  FlagProvider,
  type IConfig,
  useFlag,
  useUnleashContext,
} from "@unleash/proxy-client-react"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react"
import { env } from "@/env/env.client"
import { useFlagsReadyWithFallback } from "@/hooks/use-flags-ready-with-fallback"

/**
 * Unified feature-flags provider across all zones.
 *
 * Merged from the messages and profile zones in Phase B2. Both flag
 * definitions live here; consumers read whichever they care about via
 * `useFeatureFlags()`. New flags get added to `FeatureFlagNames` plus
 * `AvailableFeatureFlags` plus the bridge's `useMemo` payload.
 */
const FeatureFlagNames = {
  /**
   * Profile zone — gates the "export my data" lifecycle action. Restored
   * after a privacy incident so the data-export feature can be turned off
   * at runtime. Defaults OFF (safe default): the export UI stays hidden
   * unless Unleash explicitly enables `export-user`.
   */
  ExportUser: "export-user",
  /**
   * Submission linking (AB#39580) — runtime toggle for messaging surfaces
   * that link a message to a Journey-Builder submission. Defaults ON so
   * current deployments are unchanged; can be turned off without a
   * redeploy when submission-linked functionality must be hidden. (The
   * build-time `NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION` flag governs
   * whether a deployment ships Journey-Builder at all; this governs the
   * per-user/runtime visibility of the linked UI within such a build.)
   */
  SubmissionLinking: "submission-linking",
} as const

interface AvailableFeatureFlags {
  isFlagsReady: boolean
  isUserExportEnabled: boolean
  isSubmissionLinkingEnabled: boolean
}

const defaultFeatureFlags: AvailableFeatureFlags = {
  isFlagsReady: true,
  // Defaults OFF: the data-export feature stays hidden unless Unleash
  // explicitly turns `export-user` on. This is the safe default following
  // the privacy incident — an unconfigured or unreachable flag server
  // never exposes the export UI.
  isUserExportEnabled: false,
  // Defaults ON: when Unleash is unconfigured (e.g. standalone deploy
  // without a flag server) submission linking stays enabled so behaviour
  // matches a fully-flagged deployment that has the flag turned on.
  isSubmissionLinkingEnabled: true,
}

const FeatureFlagsContext =
  createContext<AvailableFeatureFlags>(defaultFeatureFlags)

function FeatureFlagsBridge({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const updateContext = useUnleashContext()
  const { isFlagsReady, useFallbackValues } = useFlagsReadyWithFallback()

  useEffect(() => {
    if (user?.sub) {
      void updateContext({ userId: user.sub })
    }
  }, [user?.sub, updateContext])

  const isUserExportEnabled = useFlag(FeatureFlagNames.ExportUser)
  const isSubmissionLinkingEnabled = useFlag(FeatureFlagNames.SubmissionLinking)

  const value = useMemo<AvailableFeatureFlags>(
    () => ({
      isFlagsReady,
      // Data export defaults OFF: while flags are loading or the proxy is
      // unreachable we keep it disabled so the export UI is never exposed
      // without an explicit `export-user` opt-in (safe default post-incident).
      isUserExportEnabled: useFallbackValues ? false : isUserExportEnabled,
      // Submission linking defaults ON: while flags are loading or the
      // proxy is unreachable we keep it enabled so behaviour matches a
      // deployment whose `submission-linking` flag is turned on (the
      // documented default). Turn the flag OFF in Unleash to hide it.
      isSubmissionLinkingEnabled: useFallbackValues
        ? true
        : isSubmissionLinkingEnabled,
    }),
    [
      isFlagsReady,
      useFallbackValues,
      isUserExportEnabled,
      isSubmissionLinkingEnabled,
    ],
  )

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

const ABORT_ERROR = "AbortError"

/**
 * Flag fetch that gives up quietly while the browser is offline.
 *
 * Unleash logs every rejection except an `AbortError` via `console.error`,
 * which Faro reports as an exception: one per 30s poll per offline tab.
 * Aborting instead skips the log and the error state, so flags keep their
 * last value and the next poll after reconnecting recovers by itself.
 * Failures while online still reach the client untouched.
 */
const fetchUnlessOffline: typeof fetch = (input, init) => {
  if (navigator.onLine) {
    return fetch(input, init)
  }

  return Promise.reject(new DOMException("Browser is offline", ABORT_ERROR))
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const unleashUrl = env.NEXT_PUBLIC_UNLEASH_URL
  const clientKey = env.NEXT_PUBLIC_UNLEASH_CLIENT_KEY

  if (!unleashUrl || !clientKey) {
    return (
      <FeatureFlagsContext.Provider value={defaultFeatureFlags}>
        {children}
      </FeatureFlagsContext.Provider>
    )
  }

  const config: IConfig = {
    url: unleashUrl,
    clientKey,
    appName: env.NEXT_PUBLIC_UNLEASH_APP_NAME,
    refreshInterval: 30,
    fetch: fetchUnlessOffline,
    // A failed metrics POST is logged via `console.error` (reported by Faro)
    // and, unlike the flag fetch, cannot be silenced through `fetch`.
    disableMetrics: true,
  }

  return (
    <FlagProvider config={config}>
      <FeatureFlagsBridge>{children}</FeatureFlagsBridge>
    </FlagProvider>
  )
}

export function useFeatureFlags(): AvailableFeatureFlags {
  return useContext(FeatureFlagsContext)
}
