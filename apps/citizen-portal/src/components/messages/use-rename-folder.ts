"use client"

import { useSagClient } from "@ogcio/sag-client/react"
import { useCallback, useState } from "react"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"
import { isConflictError } from "./folder-errors"

export interface RenameFolderResult {
  ok: boolean
  /** True when the new name collided with an existing folder (HTTP 409). */
  conflict?: boolean
}

export interface UseRenameFolderOptions {
  onSettled?: () => void
}

/**
 * Wraps `PATCH /messaging/api/v1/tags/:tagId` for label changes. Uses the raw
 * `SagClient` rather than `useGatewayMutation` because the target folder id —
 * and therefore the path — is only known per-call.
 */
export function useRenameFolder(options: UseRenameFolderOptions = {}) {
  const { onSettled } = options
  const client = useSagClient()
  const track = useTrack()
  const [isLoading, setIsLoading] = useState(false)

  const renameFolder = useCallback(
    async (folderId: string, label: string): Promise<RenameFolderResult> => {
      setIsLoading(true)
      try {
        await client.mutate(`/messaging/api/v1/tags/${folderId}`, "PATCH", {
          label,
        })
        track.event(ANALYTICS.folder.rename)
        return { ok: true }
      } catch (error) {
        return { ok: false, conflict: isConflictError(error) }
      } finally {
        setIsLoading(false)
        onSettled?.()
      }
    },
    [client, onSettled, track],
  )

  return { renameFolder, isLoading }
}
