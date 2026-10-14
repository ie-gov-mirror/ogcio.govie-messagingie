"use client"

import { Heading, Paragraph } from "@ogcio/design-system-react"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { CssSpinner } from "@/components/css-spinner"
import messageStyles from "@/components/messages/message-detail.module.css"
import pageTitleStyles from "@/components/page-title.module.css"
import { formatDate } from "@/util/datetime"
import { pickLocalized } from "./localized"
import styles from "./submission-detail.module.css"
import { SubmissionDetailToolbar } from "./submission-detail-toolbar"
import { SubmissionRelatedMessages } from "./submission-related-messages"
import { SubmissionStatusTag } from "./submission-status-tag"
import { useSubmission } from "./use-submissions"

export function SubmissionDetailView({ id }: { id: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  const t = useTranslations("submissions.detail")
  const { submission, isLoading, error } = useSubmission(id)
  const listHref = pathname.split("?")[0]

  if (isLoading && !submission) {
    return (
      <output
        aria-label={t("loading")}
        className='gi-flex gi-items-center gi-justify-center'
        style={{ minHeight: "30vh" }}
      >
        <CssSpinner size='xl' />
      </output>
    )
  }

  if (error || !submission) {
    return (
      <div className={`${styles.detailRoot} ${messageStyles.detailOffset}`}>
        <SubmissionDetailToolbar backHref={listHref} />
        <Paragraph className={styles.detailGutter}>
          {error?.message ?? t("notFound")}
        </Paragraph>
      </div>
    )
  }

  const textFields: { label: string; value: string }[] = [
    {
      label: t("submissionFor"),
      value: pickLocalized(submission.title, locale),
    },
    {
      label: t("description"),
      value: pickLocalized(submission.description, locale),
    },
    { label: t("id"), value: submission.id },
    {
      label: t("startDate"),
      value: formatDate(submission.createdAt, "medium"),
    },
  ]

  if (submission.submittedAt) {
    textFields.push({
      label: t("submittedDate"),
      value: formatDate(submission.submittedAt, "medium"),
    })
  }

  return (
    <div className={`${styles.detailRoot} ${messageStyles.detailOffset}`}>
      <SubmissionDetailToolbar backHref={listHref} />
      <div className={styles.detailContent}>
        <Heading
          as='h1'
          className={`${pageTitleStyles.pageTitle} ${styles.detailGutter}`}
        >
          {t("heading")}
        </Heading>
        <dl className={styles.fields}>
          {textFields.map((field) => (
            <div key={field.label} className={styles.field}>
              <dt className={styles.label}>{field.label}</dt>
              <dd className={styles.value}>{field.value}</dd>
            </div>
          ))}
          <div className={styles.field}>
            <dt className={styles.label}>{t("status")}</dt>
            <dd className={styles.value}>
              <SubmissionStatusTag status={submission.status} />
            </dd>
          </div>
        </dl>
        <SubmissionRelatedMessages
          submissionId={submission.id}
          submissionTitle={pickLocalized(submission.title, locale)}
        />
      </div>
    </div>
  )
}
