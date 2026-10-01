import { useGatewayFetch } from "@ogcio/sag-client/react"
import { useMemo } from "react"
import { getMockUnreadCount, MOCK_MESSAGES_ENABLED } from "@/mock/messages"
import { readNavSnapshot } from "@/util/nav-snapshot"

export interface InboxUnreadCountState {
  count: number
  isLoading: boolean
}

/**
 * Unread count for the inbox folder badge. Uses the messages API
 * `metadata.totalCount` when available; falls back to mock fixtures in
 * local dev. While the total is still loading we report the last count
 * the side menu showed (possibly on another zone host), and only expose
 * `isLoading` when there is none, so the badge does not flash a spinner
 * after a cross-host page load.
 */
export function useInboxUnreadCount(enabled = true): InboxUnreadCountState {
  // Only mounted after sign-in, never in the static HTML, so a direct
  // cookie read cannot cause a hydration mismatch.
  const snapshot = readNavSnapshot()
  const { metadata, isLoading } = useGatewayFetch<
    unknown[],
    { totalCount?: number }
  >("/messaging/api/v1/messages?limit=1&offset=0&isSeen=false&untagged=true", {
    enabled,
  })

  return useMemo(() => {
    if (metadata?.totalCount != null) {
      return { count: metadata.totalCount, isLoading: false }
    }

    if (isLoading) {
      return snapshot != null
        ? { count: snapshot, isLoading: false }
        : { count: 0, isLoading: true }
    }

    const mockCount = getMockUnreadCount()
    if (MOCK_MESSAGES_ENABLED && mockCount > 0) {
      return { count: mockCount, isLoading: false }
    }

    return { count: 0, isLoading: false }
  }, [isLoading, metadata?.totalCount, snapshot])
}
