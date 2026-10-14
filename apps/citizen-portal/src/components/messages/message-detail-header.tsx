"use client"

import { useTranslations } from "next-intl"
import pageTitleStyles from "@/components/page-title.module.css"
import { formatDate } from "@/util/datetime"
import styles from "./message-detail.module.css"
import { SenderName } from "./sender-name"

export interface MessageDetailHeaderProps {
  subject: string
  organisationId: string
  createdAt: string
}

export function MessageDetailHeader({
  subject,
  organisationId,
  createdAt,
}: MessageDetailHeaderProps) {
  const t = useTranslations("home.detail")

  return (
    <header>
      <h1 className={`${pageTitleStyles.pageTitle} ${styles.subject}`}>
        {subject || t("noSubject")}
      </h1>
      <dl className={styles.metadata}>
        <div className={styles.metadataRow}>
          <dt className={styles.metadataLabel}>{t("from")}</dt>
          <dd className={styles.metadataValue}>
            <SenderName organisationId={organisationId} />
          </dd>
        </div>
        <div className={styles.metadataRow}>
          <dt className={styles.metadataLabel}>{t("date")}</dt>
          <dd className={styles.metadataValue}>
            <time dateTime={createdAt}>{formatDate(createdAt, "long")}</time>
          </dd>
        </div>
      </dl>
    </header>
  )
}
