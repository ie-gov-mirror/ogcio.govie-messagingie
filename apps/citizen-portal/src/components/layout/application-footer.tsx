"use client"

import { useCrossZoneLink } from "@citizen-portal/shared"
import { Footer, Link, Stack, Text } from "@ogcio/design-system-react"
import { useLocale, useTranslations } from "next-intl"

/**
 * Application footer shared across all zones.
 *
 * Unified from the messages and profile zones in Phase B2. The profile
 * version was chosen as the base because the policy pages (privacy,
 * cookies, accessibility statement, terms-of-use, contact-support) all
 * live in the profile zone — `useCrossZoneLink("profile", …)` routes
 * them to the right hostname when the unified app runs behind multiple
 * nginx server_names. (The messages-zone version constructed the URLs
 * from `NEXT_PUBLIC_BASE_URL`, which was correct only because the
 * policy pages happened to live behind the same hostname there.)
 *
 * Layout follows the DS "with utility slot only" / minimal footer pattern:
 * https://ds.services.gov.ie/components/library/footer/react/#with-utility-slot-only
 *
 * The `showContactSupport` toggle comes from the messages zone — used
 * by error pages where contacting support from a broken state is
 * ambiguous. Defaults true.
 *
 * The `showWhatsNew` toggle hides the messages-zone link on shells
 * where it is not relevant (e.g. public policy pages).
 */
export function ApplicationFooter({
  showContactSupport = true,
  showWhatsNew = true,
}: {
  showContactSupport?: boolean
  showWhatsNew?: boolean
}) {
  const t = useTranslations("navigation.footer")
  const locale = useLocale()
  const crossZone = useCrossZoneLink()

  const policyLink = (path: string) =>
    crossZone("profile", `/${locale}/${path}`)

  return (
    <Footer
      // Reserve chrome height so client paint / logo decode don't shift the page (CLS).
      style={{ marginTop: "auto", minHeight: "12rem" }}
      utilitySlot={
        <Stack
          wrap
          direction={{ base: "column", md: "row" }}
          gap={4}
          justify='center'
          align='center'
        >
          {showWhatsNew ? (
            <Link
              href={crossZone("messages", `/${locale}/whats-new`)}
              noColor
              external
            >
              {t("link.whatsNew")}
            </Link>
          ) : null}
          <Link href={policyLink("privacy-policy")} noColor external>
            {t("link.privacy")}
          </Link>
          <Link href={policyLink("cookie-policy")} noColor external>
            {t("link.cookies")}
          </Link>
          <Link href={policyLink("accessibility-statement")} noColor external>
            {t("link.accessibilityStatement")}
          </Link>
          <Link href={policyLink("terms-of-use")} noColor external>
            {t("link.termsOfUse")}
          </Link>
          {showContactSupport ? (
            <Link href={policyLink("contact-support")} noColor external>
              {t("link.contactSupport")}
            </Link>
          ) : null}
          <Text className='gi-text-sm'>
            {t("text.trademark", { year: new Date().getFullYear() })}
          </Text>
        </Stack>
      }
    />
  )
}
