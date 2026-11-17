"use client"

import { useGatewayMutation } from "@ogcio/sag-client/react"
import { useCallback, useState } from "react"
import {
  messagesApi,
  type RestoreEraseMessagesBody,
  type RestoreEraseMessagesResponse,
} from "@/api/messages"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"

export interface RestoreEraseResult {
  ok: boolean
  ids: string[]
}

export interface UseRestoreEraseOptions {
  /** Called after an attempt (success or failure) so the caller can refresh lists. */
  onSettled?: () => void
}

/**
 * Shared by the two Deleted-folder actions: both POST `{ ids }` and differ
 * only in path and analytics event. Restore moves messages back to the inbox;
 * erase removes them from the account for good.
 */
function useIdsAction(
  path: string,
  event: typeof ANALYTICS.message.restore | typeof ANALYTICS.message.erase,
  { onSettled }: UseRestoreEraseOptions,
) {
  const track = useTrack()
  const { trigger, isLoading } = useGatewayMutation<
    RestoreEraseMessagesResponse,
    RestoreEraseMessagesBody
  >(path, { method: "POST" })
  const [lastResult, setLastResult] = useState<RestoreEraseResult | null>(null)

  const run = useCallback(
    async (ids: string[]): Promise<RestoreEraseResult> => {
      const body = messagesApi.deleteBody(ids)
      try {
        await trigger(body)
        track.event(event, body.ids.length)
        const result = { ok: true, ids: body.ids }
        setLastResult(result)
        return result
      } catch {
        const result = { ok: false, ids: body.ids }
        setLastResult(result)
        return result
      } finally {
        onSettled?.()
      }
    },
    [trigger, onSettled, track, event],
  )

  const dismissResult = useCallback(() => setLastResult(null), [])

  return { run, isLoading, lastResult, dismissResult }
}

export function useRestoreMessages(options: UseRestoreEraseOptions = {}) {
  return useIdsAction(
    messagesApi.restorePath(),
    ANALYTICS.message.restore,
    options,
  )
}

export function useEraseMessages(options: UseRestoreEraseOptions = {}) {
  return useIdsAction(messagesApi.erasePath(), ANALYTICS.message.erase, options)
}
