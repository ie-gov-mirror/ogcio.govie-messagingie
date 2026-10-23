"use client"

import { Heading, Paragraph } from "@ogcio/design-system-react"
import { useGatewayFetch } from "@ogcio/sag-client/react"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { type Organisation, profileApi } from "@/api/profile"
import { CssSpinner } from "@/components/css-spinner"
import messageStyles from "@/components/messages/message-detail.module.css"
import pageTitleStyles from "@/components/page-title.module.css"
import { Skeleton } from "@/components/skeleton/skeleton"
import { LANG_GA } from "@/const"
import { formatDate } from "@/util/datetime"
import { pickLocalized } from "./localized"
import styles from "./submission-detail.module.css"
import { SubmissionDetailToolbar } from "./submission-detail-toolbar"
import { SubmissionRelatedMessages } from "./submission-related-messages"
import { SubmissionStatusTag } from "./submission-status-tag"
import { useSubmission } from "./use-submissions"

/**
 * Name of the organisation handling the application. Journey-Builder's
 * `organizationId` is the publishing organisation's Logto id, the same id the
 * profile service names. Profile only knows a fixed set of organisations, so
 * an unknown id renders nothing rather than an "unknown" placeholder.
 */
function SubmissionOrganisation({
  organizationId,
}: {
  organizationId: string
}) {
  const locale = useLocale()
  const { data, isLoading } = useGatewayFetch<Organisation>(
    profileApi.organisationKey(organizationId),
  )

  // Hold the line while the name loads so the title below doesn't jump.
  if (isLoading) {
    return (
      <Paragraph className={styles.organisation}>
        <Skeleton width='12rem' dataTestid='organisation-skeleton' />
      </Paragraph>
    )
  }

  const name = data?.translations?.[locale === LANG_GA ? "ga" : "en"]?.name
  if (!name) return null

  return <Paragraph className={styles.organisation}>{name}</Paragraph>
}

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

  const title = pickLocalized(submission.title, locale)
  const description = pickLocalized(submission.description, locale)

  const fields: { label: string; value: ReactNode }[] = [
    {
      label: t("applicationStatus"),
      value: <SubmissionStatusTag status={submission.status} />,
    },
    {
      label: t("lastUpdate"),
      value: (
        <time dateTime={submission.updatedAt}>
          {formatDate(submission.updatedAt, "short")}
        </time>
      ),
    },
  ]

  if (submission.submittedAt) {
    fields.push({
      label: t("submittedDate"),
      value: (
        <time dateTime={submission.submittedAt}>
          {formatDate(submission.submittedAt, "short")}
        </time>
      ),
    })
  }

  fields.push({ label: t("id"), value: submission.id })

  return (
    <div className={`${styles.detailRoot} ${messageStyles.detailOffset}`}>
      <SubmissionDetailToolbar backHref={listHref} />
      <div className={styles.detailContent}>
        <div className={`${styles.intro} ${styles.detailGutter}`}>
          <SubmissionOrganisation organizationId={submission.organizationId} />
          <Heading as='h1' className={pageTitleStyles.pageTitle}>
            {title}
          </Heading>
          {description ? <Paragraph size='lg'>{description}</Paragraph> : null}
        </div>
        <dl className={styles.fields}>
          {fields.map((field) => (
            <div key={field.label} className={styles.field}>
              <dt className={styles.label}>{field.label}</dt>
              <dd className={styles.value}>{field.value}</dd>
            </div>
          ))}
        </dl>
        <SubmissionRelatedMessages
          submissionId={submission.id}
          submissionTitle={title}
        />
      </div>
    </div>
  )
}
