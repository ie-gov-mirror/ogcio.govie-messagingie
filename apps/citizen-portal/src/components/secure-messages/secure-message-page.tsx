"use client"

import {
  type SagFetchError,
  useAuth,
  useGatewayFetch,
} from "@ogcio/sag-client/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef } from "react"
import { type Profile, profileApi } from "@/api/profile"
import { AccountLinkingView } from "./account-linking-view"
import { ServiceError } from "./service-error"

interface PartialMessage {
  recipientUserId: string
}

type FlowState =
  | { step: "loading" }
  | { step: "redirect-to-message"; messageId: string }
  | { step: "redirect-to-home" }
  | { step: "show-linking"; linkedProfile: Profile; currentProfile: Profile }
  | { step: "error" }

/**
 * Orchestrates the secure-message account-linking flow entirely client-side.
 *
 * The messageId is read from the `?id=` query parameter:
 *   /[locale]/secure-messages?id=<messageId>
 *
 * Flow:
 * 1. Read messageId from searchParams
 * 2. Attempt to fetch the message with the user's token
 * 3. If accessible (200), redirect to /messages?id=<messageId>
 * 4. If 401/403/404, fetch via M2M to get recipient info
 * 5. Fetch recipient profile via M2M
 * 6. If profile already linked (id !== primaryUserId), redirect to /messages
 * 7. Otherwise show the account-linking confirmation UI
 */
export function SecureMessagePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const messageId = searchParams.get("id")
  const { user } = useAuth()
  const hasRedirected = useRef(false)

  // 1. Try fetching the message with user token
  const {
    data: userMessage,
    error: userMessageError,
    isLoading: userMessageLoading,
  } = useGatewayFetch<PartialMessage>(
    messageId ? `/messaging/api/v1/messages/${messageId}` : null,
  )

  // Determine if we need the M2M fallback.
  // Use duck-typing instead of instanceof — class identity can break
  // across bundled module boundaries in production builds.
  const needsM2M =
    !userMessageLoading &&
    userMessageError != null &&
    "status" in userMessageError &&
    typeof (userMessageError as SagFetchError).status === "number" &&
    [401, 403, 404].includes((userMessageError as SagFetchError).status)

  // 2. Fetch message via M2M (only when user-token fetch returned 401/403/404)
  const {
    data: m2mMessage,
    error: m2mMessageError,
    isLoading: m2mMessageLoading,
  } = useGatewayFetch<PartialMessage>(
    needsM2M ? `/messaging/api/v1/messages/${messageId}` : null,
    { actorType: "m2m" },
  )

  // 3. Fetch recipient profile via M2M (only when we have a recipientUserId)
  const recipientUserId = m2mMessage?.recipientUserId
  const {
    data: linkedProfile,
    error: profileError,
    isLoading: profileLoading,
  } = useGatewayFetch<Profile>(
    recipientUserId ? profileApi.detailKey(recipientUserId) : null,
    { actorType: "m2m" },
  )

  // 4. Fetch current user's profile (only when we have a linked profile to compare)
  const {
    data: currentProfile,
    error: currentProfileError,
    isLoading: currentProfileLoading,
  } = useGatewayFetch<Profile>(
    linkedProfile && user?.sub ? profileApi.detailKey(user.sub) : null,
  )

  // Derive flow state
  const flowState = useMemo((): FlowState => {
    if (!messageId) return { step: "error" }

    // Still loading user-token message fetch
    if (userMessageLoading) return { step: "loading" }

    // User owns the message — redirect to view it
    if (userMessage && !userMessageError) {
      return { step: "redirect-to-message", messageId }
    }

    // User-token failed with non-auth error (server issue)
    if (userMessageError && !needsM2M) {
      return { step: "error" }
    }

    // M2M fetches in progress
    if (m2mMessageLoading || profileLoading || currentProfileLoading) {
      return { step: "loading" }
    }

    // M2M message fetch failed
    if (m2mMessageError || !m2mMessage) {
      return { step: "error" }
    }

    // Profile fetch failed
    if (profileError || !linkedProfile) {
      return { step: "error" }
    }

    // Current profile fetch failed
    if (currentProfileError || !currentProfile) {
      return { step: "error" }
    }

    // Profile already linked to another user
    if (linkedProfile.id !== linkedProfile.primaryUserId) {
      return { step: "redirect-to-home" }
    }

    // Show account linking UI
    return {
      step: "show-linking",
      linkedProfile,
      currentProfile,
    }
  }, [
    messageId,
    userMessage,
    userMessageError,
    userMessageLoading,
    needsM2M,
    m2mMessage,
    m2mMessageError,
    m2mMessageLoading,
    linkedProfile,
    profileError,
    profileLoading,
    currentProfile,
    currentProfileError,
    currentProfileLoading,
  ])

  // Derive the locale prefix (e.g. "/en") from the pathname
  const localePath = useMemo(
    () => pathname.replace(/\/secure-messages$/, ""),
    [pathname],
  )

  // Handle redirects
  useEffect(() => {
    if (hasRedirected.current) return

    if (flowState.step === "redirect-to-message") {
      hasRedirected.current = true
      router.replace(`${localePath}/messages?id=${flowState.messageId}`)
    } else if (flowState.step === "redirect-to-home") {
      hasRedirected.current = true
      router.replace(`${localePath}/messages`)
    }
  }, [flowState, router, localePath])

  if (!messageId) {
    return <ServiceError />
  }

  if (
    flowState.step === "loading" ||
    flowState.step === "redirect-to-message" ||
    flowState.step === "redirect-to-home"
  ) {
    return (
      <output aria-label='Loading'>
        <div>Loading...</div>
      </output>
    )
  }

  if (flowState.step === "error") {
    return <ServiceError />
  }

  return (
    <AccountLinkingView
      currentProfile={flowState.currentProfile}
      linkedProfile={flowState.linkedProfile}
      messageId={messageId}
    />
  )
}
