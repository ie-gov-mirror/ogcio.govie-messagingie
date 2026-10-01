"use client"

import {
  isCitizenOnboarded,
  useAuth,
  useGatewayFetch,
} from "@ogcio/sag-client/react"
import { useIdleMount } from "@/hooks/use-idle-mount"

const REQUIRED_SAFE_LEVEL = 2

interface ProfileSafeLevel {
  safeLevel?: number
}

/**
 * Whether the authenticated user may see cross-application links in
 * the side menu (dashboard, messaging, view my profile).
 *
 * Citizens who are not yet onboarded, or whose SAFE level is below 2,
 * only get the language switcher and logout in the drawer. Used by the
 * unified `PageHeader`.
 */
export function useShowApplicationLinks(): boolean {
  return useApplicationLinksState() === true
}

/**
 * Same as `useShowApplicationLinks`, but `undefined` while this hook's own
 * auth check is still running (each `useAuth()` call checks separately),
 * so callers can keep what they last showed instead of flashing it off.
 */
export function useApplicationLinksState(): boolean | undefined {
  const { user, claims, loading: authLoading } = useAuth()
  const isOnboarded = isCitizenOnboarded(claims?.roles)
  const idleReady = useIdleMount()

  const profilePath =
    user?.sub && isOnboarded && idleReady
      ? `/profile/api/v1/profiles/${user.sub}?consentSubjects=messaging`
      : null

  const { data: profile } = useGatewayFetch<ProfileSafeLevel>(profilePath)

  if (authLoading) {
    return undefined
  }

  if (!user) {
    return false
  }

  if (!isOnboarded) {
    return false
  }

  if (
    typeof profile?.safeLevel === "number" &&
    profile.safeLevel < REQUIRED_SAFE_LEVEL
  ) {
    return false
  }

  return true
}
