"use client"

import { useEffect, useRef } from "react"
import type { SearchEvent } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"

/**
 * Reports a list's committed search (the `?search=` value) to Matomo once its
 * results have loaded, with the result count as value. The search text itself
 * is never sent. Each query is reported once: paging or filtering the same
 * search does not report again, and an empty search reports nothing.
 */
export function useSearchTracking(
  searchEvent: SearchEvent,
  search: string | null,
  { isLoading, totalCount }: { isLoading: boolean; totalCount: number },
) {
  const track = useTrack()
  const reported = useRef<string | null>(null)
  const query = search?.trim() ?? ""

  useEffect(() => {
    if (!query) {
      reported.current = null
      return
    }
    if (isLoading || reported.current === query) return
    reported.current = query
    track.event(searchEvent, totalCount)
  }, [query, isLoading, totalCount, searchEvent, track])
}
