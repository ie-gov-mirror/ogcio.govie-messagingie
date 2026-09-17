"use client"

import { useEnv } from "@citizen-portal/shared"
import { Heading, Link, Paragraph, Stack } from "@ogcio/design-system-react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Suspense } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { env } from "@/env/env.client"
import { getTrustedRedirectOrigins } from "@/util/trusted-redirect-origins"
import { getValidReturnUrl } from "@/util/valid-return-url"

function WrongAccountErrorContent() {
  const t = useTranslations("wrongAccountPage")
  const searchParams = useSearchParams()
  const { hosts } = useEnv()
  const returnUrl = getValidReturnUrl(
    searchParams.get("returnUrl"),
    getTrustedRedirectOrigins(hosts),
  )

  const appBase = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")
  const signoutHref = returnUrl
    ? `${appBase}/en/global-signout?postRedirectUri=${encodeURIComponent(returnUrl)}&role=citizen`
    : null

  return (
    <Stack direction='column' gap={8}>
      <Heading>{t("title")}</Heading>
      <Paragraph>{t("descriptionLine1")}</Paragraph>
      <Paragraph>{t("descriptionLine2")}</Paragraph>
      {signoutHref ? (
        <Link
          href={signoutHref}
          asButton={{
            appearance: "default",
            size: "large",
            variant: "primary",
          }}
        >
          {t("logOutBttn")}
        </Link>
      ) : (
        <Paragraph>{t("invalidReturnUrl")}</Paragraph>
      )}
    </Stack>
  )
}

export function WrongAccountErrorClient() {
  return (
    <Suspense
      fallback={
        <output
          aria-label='Loading'
          className='gi-flex gi-items-center gi-justify-center'
          style={{ minHeight: "30vh" }}
        >
          <CssSpinner size='xl' />
        </output>
      }
    >
      <WrongAccountErrorContent />
    </Suspense>
  )
}
