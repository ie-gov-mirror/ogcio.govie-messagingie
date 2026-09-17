"use client"

import "@ogcio/design-system-react/styles.css"
import "@ogcio/theme-govie/theme.css"
import {
  Button,
  Container,
  Heading,
  Paragraph,
  Stack,
} from "@ogcio/design-system-react"
import { NextIntlClientProvider, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { DEFAULT_LOCALE } from "@/const"
import { detectLocale, type Locale, messagesMap } from "@/i18n/locale"
import { reloadOnceIfChunkLoadError } from "@/util/chunk-error"

function GlobalErrorBody({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const t = useTranslations("errors.global")

  return (
    <div role='alert' aria-live='assertive' aria-atomic='true'>
      <Stack direction='column' gap={4}>
        <Heading as='h2'>{t("title")}</Heading>
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
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (reloadOnceIfChunkLoadError(error)) return
    setLocale(detectLocale())
    setMounted(true)
  }, [error])

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className='gi-flex gi-flex-col'
        style={{ minHeight: "100vh", padding: "var(--gieds-space-16)" }}
        suppressHydrationWarning
      >
        <main>
          {mounted ? (
            <NextIntlClientProvider
              locale={locale}
              messages={messagesMap[locale]}
            >
              <Container>
                <GlobalErrorBody error={error} reset={reset} />
              </Container>
            </NextIntlClientProvider>
          ) : (
            <Container>
              <div role='alert' aria-live='assertive' aria-atomic='true'>
                <Stack direction='column' gap={4}>
                  <Heading as='h2'>An unexpected error occurred</Heading>
                  {error.message && (
                    <Paragraph size='sm'>{error.message}</Paragraph>
                  )}
                  <div>
                    <Button onClick={reset}>Retry</Button>
                  </div>
                </Stack>
              </div>
            </Container>
          )}
        </main>
      </body>
    </html>
  )
}
