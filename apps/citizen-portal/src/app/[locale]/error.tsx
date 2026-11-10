"use client"

import { faro } from "@grafana/faro-web-sdk"
import { Button, Heading, Paragraph, Stack } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef } from "react"
import { AnalyticsProvider } from "@/components/analytics-provider"
import { ANALYTICS } from "@/const/analytics"
import { useTrack } from "@/hooks/use-track"
import {
  isChunkLoadError,
  reloadOnceIfChunkLoadError,
} from "@/util/chunk-error"

function SystemErrorTracker() {
  const track = useTrack()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    // No error message in the event — raw messages are PII/cardinality risk.
    // Faro (below) keeps the diagnostic detail.
    track.event(ANALYTICS.system.error)
  }, [track])

  return null
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("errors.page")

  useEffect(() => {
    if (isChunkLoadError(error)) {
      // A reload recovers a stale tab, so there is nothing to report yet.
      if (reloadOnceIfChunkLoadError(error)) return
      faro.api?.pushLog([`ChunkLoadError: ${error.message}`])
    }
    faro.api?.pushLog([`Error: ${error.message}`])
  }, [error])

  return (
    <AnalyticsProvider>
      <SystemErrorTracker />
      <div role='alert' aria-live='assertive' aria-atomic='true'>
        <Stack direction='column' gap={4}>
          <Heading as='h1'>{t("title")}</Heading>
          <Paragraph>{t("message")}</Paragraph>
          {error.message && (
            <Paragraph size='sm'>
              <span className='gi-sr-only'>{t("title")}: </span>
              {error.message}
            </Paragraph>
          )}
          <div>
            <Button onClick={reset}>{t("retry")}</Button>
          </div>
        </Stack>
      </div>
    </AnalyticsProvider>
  )
}
