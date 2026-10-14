"use client"

import type { AuthUser } from "@ogcio/sag-client"
import { useGatewayFetch } from "@ogcio/sag-client/react"
import { useEffect } from "react"
import { type Profile, profileApi } from "@/api/profile"
import { useIdleMount } from "@/hooks/use-idle-mount"
import { useNavName, useNavSub, writeNavName } from "@/util/nav-snapshot"

export interface PublicNameState {
  publicName: string
  isLoading: boolean
}

/**
 * Resolves the user's display name with a graceful fallback chain:
 *
 *   1. profile-service `publicName` (the citizen-chosen name)
 *   2. SAG `user.name` (the IdP-provided display name)
 *   3. SAG `user.email`
 *   4. empty string
 *
 * The profile fetch is keyed on `user.sub` so it stays paused until
 * auth has resolved (and until the main thread is idle). A name stored
 * for this `user.sub` skips the fetch. A name left by someone else, or a
 * cookie with no owner, does not.
 *
 * `isLoading` means "nothing settled yet" rather than SWR's pending:
 * `user.name` and `publicName` are different names for the same account, so
 * applying the chain early paints one and then swaps to the other. Settling
 * on failure keeps a profile outage from stalling on a skeleton forever.
 * A failed lookup is not stored, so the next visit tries the profile again.
 */
export function usePublicName(user: AuthUser | undefined): PublicNameState {
  const cached = useNavName()
  const owner = useNavSub()
  const idleReady = useIdleMount()
  const sub = user?.sub
  const known = Boolean(sub) && owner === sub && cached != null
  const { data, error } = useGatewayFetch<Profile>(
    !known && sub && idleReady ? profileApi.detailKey(sub) : null,
  )

  const fetched = data?.publicName
  useEffect(() => {
    if (fetched && sub) writeNavName(sub, fetched)
  }, [fetched, sub])

  if (known && cached) return { publicName: cached, isLoading: false }

  return {
    publicName: data?.publicName ?? user?.name ?? user?.email ?? "",
    isLoading: Boolean(sub) && !data && !error,
  }
}
