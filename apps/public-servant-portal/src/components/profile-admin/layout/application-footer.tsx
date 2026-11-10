"use client"

import { Footer, Link } from "@ogcio/design-system-react"
import { useLocale, useTranslations } from "next-intl"
import { env } from "@/env/env.client"

export function ApplicationFooter() {
  const t = useTranslations("navigation.footer")
  const locale = useLocale()
  const profileUrl = env.NEXT_PUBLIC_PROFILE_URL

  const policyLink = (path: string) =>
    new URL(`/${locale}/${path}`, profileUrl).href

  return (
    <Footer
      utilitySlot={
        <div className='gi-flex gi-flex-row gi-gap-y-2 gi-gap-4 gi-justify-start gi-flex-wrap'>
          <Link href={policyLink("privacy-policy")} external noColor>
            {t("link.privacy")}
          </Link>
          <Link href={policyLink("cookie-policy")} external noColor>
            {t("link.cookies")}
          </Link>
          <Link href={policyLink("accessibility-statement")} external noColor>
            {t("link.accessibilityStatement")}
          </Link>
          <Link href={policyLink("terms-of-use")} external noColor>
            {t("link.termsOfUse")}
          </Link>
          <Link href={policyLink("contact-support")} external noColor>
            {t("link.contactSupport")}
          </Link>
          <div className='gi-text-sm'>
            {t("text.trademark", { year: new Date().getFullYear() })}
          </div>
        </div>
      }
    />
  )
}
