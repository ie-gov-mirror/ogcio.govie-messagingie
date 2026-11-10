"use client"

import { Heading, Paragraph, Stack } from "@ogcio/design-system-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { TwoColumnLayout } from "@/components/layout/containers"
import { BoldLink } from "@/components/navigation/bold-link"
import pageTitleStyles from "@/components/page-title.module.css"
import { PublicName } from "@/components/public-name"
import type { DashboardLifeEvent } from "@/lib/discovery"
import { isLeaEnabled, isZoneEnabled } from "@/lib/feature-config"
import govieLogo from "@/public/govie.png"
import { LeDashboard } from "./le-dashboard"
import styles from "./my-dashboard.module.css"
import { MyMessages } from "./my-messages"

/**
 * Dashboard landing.
 *
 * Default (non-LEA) layout: left column is the welcome heading + recent
 * messages, right column is the gov.ie help card.
 *
 * LEA layout (AB#44320): life-event and recent-application cards, see
 * `LeDashboard`.
 */
export function MyDashboard({
  lifeEvents = [],
}: {
  lifeEvents?: DashboardLifeEvent[]
}) {
  const t = useTranslations("dashboard")

  if (isLeaEnabled()) {
    return <LeDashboard lifeEvents={lifeEvents} />
  }

  // Rich, not a `{name}` placeholder, so the skeleton sits inside the greeting.
  const welcome = t.rich("welcome", { name: () => <PublicName /> })

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
