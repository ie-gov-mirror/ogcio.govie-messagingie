"use client"

import {
  Container,
  HeaderLogo,
  HeaderNext,
  HeaderTitle,
  Heading,
  Link,
  Paragraph,
  Stack,
} from "@ogcio/design-system-react"
import { LogoHarpWhite, LogoWhite } from "@ogcio/design-system-react/logos"
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { ApplicationFooter } from "@/components/layout/application-footer"
import { MainContainer } from "@/components/layout/containers"
import { DEFAULT_LOCALE } from "@/const"
import { detectLocale, type Locale, messagesMap } from "@/i18n/locale"

function NotFoundBody() {
  const t = useTranslations("notFound")
  const tBack = useTranslations("home.button")
  const locale = useLocale()

  return (
    <div role='alert' aria-live='polite' aria-atomic='true'>
      <Stack direction='column' gap={10}>
        <Heading as='h1'>{t("heading")}</Heading>
        <Paragraph>{t("message")}</Paragraph>
        <Link href={`/${locale}/messages`} noColor noUnderline>
          {tBack("back")}
        </Link>
      </Stack>
    </div>
  )
}

export default function NotFound() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const detected = detectLocale()
    setLocale(detected)
    document.documentElement.lang = detected
    document.title = "MessagingIE"
    setMounted(true)
  }, [])

  if (!mounted) return null

  const messages = messagesMap[locale]

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HeaderNext variant='default'>
        <HeaderLogo>
          <a href={`/${locale}/messages`} aria-label='MessagingIE'>
            <LogoHarpWhite
              aria-hidden='true'
              className='gi-h-10 sm:gi-hidden'
            />
            <LogoWhite
              aria-hidden='true'
              className='gi-hidden sm:gi-block gi-h-14'
            />
          </a>
        </HeaderLogo>
        <HeaderTitle>MessagingIE</HeaderTitle>
      </HeaderNext>
      <MainContainer>
        <Container>
          <NotFoundBody />
        </Container>
      </MainContainer>
      <ApplicationFooter />
    </NextIntlClientProvider>
  )
}
