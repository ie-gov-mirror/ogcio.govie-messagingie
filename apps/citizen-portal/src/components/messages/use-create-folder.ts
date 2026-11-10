"use client"

import { useGatewayMutation } from "@ogcio/sag-client/react"
import { useCallback } from "react"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"
import { isConflictError } from "./folder-errors"

export interface CreateFolderResult {
  ok: boolean
  id?: string
  /** True when the name collided with an existing folder (HTTP 409). */
  conflict?: boolean
}

export interface UseCreateFolderOptions {
  onSettled?: () => void
}

/**
 * Wraps `POST /messaging/api/v1/tags`. Returns a discriminated result so the
 * caller can show a success toast, an inline duplicate-name error, or a
 * generic failure without reaching into the thrown error.
 */
export function useCreateFolder(options: UseCreateFolderOptions = {}) {
  const { onSettled } = options
  const track = useTrack()
  const { trigger, isLoading } = useGatewayMutation<
    { id: string },
    { label: string }
  >("/messaging/api/v1/tags", { method: "POST" })

  const createFolder = useCallback(
    async (label: string): Promise<CreateFolderResult> => {
      try {
        const result = await trigger({ label })
        track.event(ANALYTICS.folder.create)
        return { ok: true, id: result?.id }
      } catch (error) {
        return { ok: false, conflict: isConflictError(error) }
      } finally {
        onSettled?.()
      }
    },
    [trigger, onSettled, track],
  )

  return { createFolder, isLoading }
}
