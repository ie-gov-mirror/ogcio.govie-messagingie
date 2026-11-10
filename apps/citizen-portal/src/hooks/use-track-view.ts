"use client"

import { useEffect, useRef } from "react"
import type { AnalyticsEvent } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"

/**
 * Reports a view once per mount, as soon as `ready` (e.g. once the viewed
 * data has loaded). Re-renders send nothing more.
 */
export function useTrackView(entry: AnalyticsEvent, ready = true) {
  const track = useTrack()
  const tracked = useRef(false)

  useEffect(() => {
    if (!ready || tracked.current) return
    tracked.current = true
    track.event(entry)
  }, [entry, ready, track])
}
