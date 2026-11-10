"use client"

import { AnalyticsContext } from "@ogcio/nextjs-analytics"
import { useContext, useMemo } from "react"
import type { AnalyticsEvent } from "@/const/analytics"

/**
 * The one way components emit Matomo analytics. Only accepts entries of the
 * `ANALYTICS` catalogue. No-ops when there is no analytics instance (env unset
 * or outside `AnalyticsProvider`), and never lets an analytics failure reach
 * the caller. The returned object is stable across renders.
 */
export function useTrack() {
  const { analyticsInstance } = useContext(AnalyticsContext)

  return useMemo(() => {
    const send = (call: () => Promise<unknown> | undefined) => {
      try {
        call()?.catch(() => {})
      } catch {
        // analytics must never break a citizen action
      }
    }

    return {
      /** `value` is a count (e.g. messages affected); omitted when not given. */
      event(entry: AnalyticsEvent, value?: number) {
        send(() =>
          analyticsInstance?.track.event({
            event: {
              name: entry.name,
              category: entry.category,
              action: entry.action,
              ...(value === undefined ? {} : { value }),
            },
          }),
        )
      },
    }
  }, [analyticsInstance])
}
