"use client"

import { Heading, Paragraph, Stack } from "@ogcio/design-system-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { MyApplications } from "@/components/dashboard/my-applications"
import { TwoColumnLayout } from "@/components/layout/containers"
import { BoldLink } from "@/components/navigation/bold-link"
import pageTitleStyles from "@/components/page-title.module.css"
import { PublicName } from "@/components/public-name"
import { isLeaEnabled, isZoneEnabled } from "@/lib/feature-config"
import govieLogo from "@/public/govie.png"
import styles from "./my-dashboard.module.css"
import { MyMessages } from "./my-messages"

/**
 * Dashboard landing.
 *
 * Default (non-LEA) layout: left column is the welcome heading + recent
 * messages, right column is the gov.ie help card.
 *
 * LEA layout (AB#39421): the welcome heading spans the top, then two
 * columns — recent applications (Journey-Builder submissions) on the
 * left, recent messages on the right — matching the LEA dashboard design.
 * `TwoColumnLayout` collapses to a single column below the twelve-column
 * breakpoint.
 */
export function MyDashboard() {
  const t = useTranslations("dashboard")
  // Rich, not a `{name}` placeholder, so the skeleton sits inside the greeting.
  const welcome = t.rich("welcome", { name: () => <PublicName /> })

  if (isLeaEnabled()) {
    return (
      <div className={styles.landing}>
        <Heading as='h1' className={pageTitleStyles.pageTitle}>
          {welcome}
        </Heading>
        <TwoColumnLayout>
          <MyApplications />
          {isZoneEnabled("messages") ? <MyMessages /> : null}
        </TwoColumnLayout>
      </div>
    )
  }

  return (
    <TwoColumnLayout>
      <div className={styles.column}>
        <Heading as='h1' className={pageTitleStyles.pageTitle}>
          {welcome}
        </Heading>
        {isZoneEnabled("messages") ? <MyMessages /> : null}
      </div>

      <Stack direction='column' gap={5}>
        <Heading as='h2'>{t("help.title")}</Heading>
        <Stack direction='column' gap={5}>
          <Image src={govieLogo} alt='Gov.ie' />
          <Paragraph>{t("help.description")}</Paragraph>
          <BoldLink href='https://www.gov.ie' external>
            {t("help.link")}
          </BoldLink>
        </Stack>
      </Stack>
    </TwoColumnLayout>
  )
}
