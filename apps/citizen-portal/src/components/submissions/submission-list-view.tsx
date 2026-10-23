"use client"

import { Alert, Heading, Paragraph } from "@ogcio/design-system-react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useMemo, useRef } from "react"
import { InboxListChromeHeader } from "@/components/messages/inbox-list-chrome-header"
import { MessagesDataTableHeader } from "@/components/messages/messages-data-table-header"
import inboxTableStyles from "@/components/messages/unified-inbox-table.module.css"
import pageTitleStyles from "@/components/page-title.module.css"
import { useUrlSearchParams } from "@/hooks/use-url-search-params"
import type { Submission } from "@/types"
import {
  computeTotalPages,
  parseSubmissionPageSize,
  SUBMISSIONS_PAGE_SIZE,
} from "./pagination-utils"
import { SubmissionListTable } from "./submission-list-table"
import styles from "./submission-list-view.module.css"
import { useSubmissionsList } from "./use-submissions"

export function SubmissionListView() {
  const t = useTranslations("submissions")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useUrlSearchParams()
  const search = searchParams.get("search")
  const page = Number(searchParams.get("page")) || 1
  const pageSize = parseSubmissionPageSize(searchParams.get("limit"))

  const { submissions, totalCount, isLoading, error } = useSubmissionsList({
    search,
    page,
    pageSize,
  })
  const totalPages = computeTotalPages(totalCount, pageSize)

  const previousSubmissionsRef = useRef<Submission[]>([])
  const displaySubmissions = useMemo(() => {
    if (!isLoading) {
      previousSubmissionsRef.current = submissions
      return submissions
    }

    if (submissions.length > 0) {
      previousSubmissionsRef.current = submissions
      return submissions
    }

    if (previousSubmissionsRef.current.length > 0) {
      return previousSubmissionsRef.current
    }

    return submissions
  }, [submissions, isLoading])

  const handlePageSizeChange = useCallback(
    (size: number) => {
      const params = new URLSearchParams(searchParams)
      if (size === SUBMISSIONS_PAGE_SIZE) {
        params.delete("limit")
      } else {
        params.set("limit", String(size))
      }
      params.delete("page")
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  // Nothing to search or page through: replace the list chrome with a
  // banner. A failed fetch or an out-of-range page is not "no applications".
  // The empty list 404s, so SWR re-enters loading on every focus
  // revalidation; keep the last settled answer so the banner doesn't flicker.
  const isUnfilteredEmpty =
    !search && page === 1 && displaySubmissions.length === 0
  const settledEmptyRef = useRef(false)
  if (!isLoading) {
    settledEmptyRef.current = isUnfilteredEmpty && error == null
  }
  const hasNoApplications = isUnfilteredEmpty && settledEmptyRef.current

  return (
    <div className={styles.listRoot}>
      <div className={styles.intro}>
        <Heading as='h1' className={pageTitleStyles.pageTitle}>
          {t("heading")}
        </Heading>
        <Paragraph size='lg'>{t("description")}</Paragraph>
      </div>
      {hasNoApplications ? (
        <Alert
          variant='info'
          title={t("empty.title")}
          className={styles.emptyAlert}
          data-testid='submissions-empty'
        >
          <Paragraph>{t("empty.description")}</Paragraph>
        </Alert>
      ) : (
        <div className={styles.inboxBleed}>
          <div className={inboxTableStyles.listChrome}>
            <InboxListChromeHeader
              searchChrome={
                <MessagesDataTableHeader
                  enableFilters={false}
                  searchPlaceholder={t("search.placeholder")}
                  searchAriaLabel={t("search.ariaLabel")}
                  showSearchIcon
                />
              }
            />
            <SubmissionListTable
              submissions={displaySubmissions}
              isLoading={isLoading}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
          {error != null && !isLoading && (
            <Paragraph className={styles.error}>
              {t("error", { message: error.message })}
            </Paragraph>
          )}
        </div>
      )}
    </div>
  )
}
