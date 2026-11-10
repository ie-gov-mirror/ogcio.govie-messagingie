"use client"

import { Footer, Link } from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { useLocale, useTranslations } from "next-intl"
import { ANALYTICS } from "@/const/analytics"

export const ApplicationFooter = ({ profileUrl }: { profileUrl: string }) => {
  const t = useTranslations("footer")
  const getProfileUrlHref = (path: string) => {
    return new URL(path, profileUrl).href
  }
  const analyticsClient = useAnalytics()

  const locale = useLocale()

  const trackFooterAnalytics = () => {
    analyticsClient.trackEvent({
      event: {
        name: ANALYTICS.engagement.footer.name,
        category: ANALYTICS.engagement.category,
        action: ANALYTICS.engagement.footer.action,
      },
    })
  }

  return (
    <Footer
      utilitySlot={
        <div className='gi-flex gi-flex-row gi-gap-y-2 gi-gap-4 gi-justify-start gi-flex-wrap'>
          <Link
            aria-label={t("link.privacy")}
            href={getProfileUrlHref(`/${locale}/privacy-policy`)}
            onClick={trackFooterAnalytics}
            external
            noColor
          >
            {t("link.privacy")}
          </Link>
          <Link
            aria-label={t("link.cookies")}
            href={getProfileUrlHref(`/${locale}/cookie-policy`)}
            onClick={trackFooterAnalytics}
            external
            noColor
          >
            {t("link.cookies")}
          </Link>
          <Link
            aria-label={t("link.accessibilityStatement")}
            href={getProfileUrlHref(`/${locale}/accessibility-statement`)}
            onClick={trackFooterAnalytics}
            external
            noColor
          >
            {t("link.accessibilityStatement")}
          </Link>
          <Link
            aria-label={t("link.termsOfUse")}
            href={getProfileUrlHref(`/${locale}/terms-of-use`)}
            onClick={trackFooterAnalytics}
            external
            noColor
          >
            {t("link.termsOfUse")}
          </Link>
          <Link
            aria-label={t("link.contactSupport")}
            href={getProfileUrlHref(`/${locale}/contact-support`)}
            onClick={trackFooterAnalytics}
            external
            noColor
          >
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
