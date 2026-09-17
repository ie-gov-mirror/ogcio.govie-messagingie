"use client"

import { faro } from "@grafana/faro-web-sdk"
import { Button, Heading, Paragraph, Stack } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import {
  isChunkLoadError,
  reloadOnceIfChunkLoadError,
} from "@/util/chunk-error"

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
      faro.api?.pushLog([`ChunkLoadError: ${error.message}`])
      if (reloadOnceIfChunkLoadError(error)) return
    }
    faro.api?.pushLog([`Error: ${error.message}`])
  }, [error])

  return (
    <div role='alert' aria-live='assertive' aria-atomic='true'>
      <Stack direction='column' gap={4}>
        <Heading as='h1'>{t("title")}</Heading>
        <Paragraph>{t("paragraph")}</Paragraph>
        {error.message && (
          <Paragraph size='sm'>
            <span className='gi-sr-only'>{t("title")}: </span>
            {error.message}
          </Paragraph>
        )}
        <div>
          <Button onClick={reset}>{t("button")}</Button>
        </div>
      </Stack>
    </div>
  )
}
