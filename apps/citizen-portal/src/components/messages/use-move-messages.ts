"use client"

import { useGatewayMutation } from "@ogcio/sag-client/react"
import { useCallback, useState } from "react"
import {
  type AssignTagBody,
  type AssignTagResponse,
  messagesApi,
} from "@/api/messages"

export interface MoveMessagesResult {
  ok: boolean
  ids: string[]
  folderId: string | null
}

export interface UseMoveMessagesOptions {
  onSettled?: () => void
}

/**
 * Wraps `POST /messaging/api/v1/messages/tags`, which assigns (or, with
 * `tagId: null`, removes) a folder tag on a set of messages. `folderId`
 * mirrors the move modal's destination value: a tag id moves into a folder,
 * `null` moves back to the inbox.
 */
export function useMoveMessages(options: UseMoveMessagesOptions = {}) {
  const { onSettled } = options
  const { trigger, isLoading } = useGatewayMutation<
    AssignTagResponse,
    AssignTagBody
  >(messagesApi.tagsPath(), { method: "POST" })
  const [lastResult, setLastResult] = useState<MoveMessagesResult | null>(null)

  const moveIds = useCallback(
    async (
      ids: string[],
      folderId: string | null,
    ): Promise<MoveMessagesResult> => {
      const body = messagesApi.moveBody(ids, folderId)
      try {
        await trigger(body)
        const result: MoveMessagesResult = {
          ok: true,
          ids: body.messageIds,
          folderId,
        }
        setLastResult(result)
        return result
      } catch {
        const result: MoveMessagesResult = {
          ok: false,
          ids: body.messageIds,
          folderId,
        }
        setLastResult(result)
        return result
      } finally {
        onSettled?.()
      }
    },
    [trigger, onSettled],
  )

  const dismissResult = useCallback(() => setLastResult(null), [])

  return { moveIds, isLoading, lastResult, dismissResult }
}
