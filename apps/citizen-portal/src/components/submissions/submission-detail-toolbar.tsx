"use client"

import { Icon, Link } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import messageDetailStyles from "@/components/messages/message-detail.module.css"
import detailStyles from "./submission-detail.module.css"

/**
 * Back-only header for the submission detail. Deliberately mirrors
 * `MessageDetailToolbar` (same nav + link styling) but omits the Move and
 * Delete actions, which don't apply to submissions.
 */
export function SubmissionDetailToolbar({ backHref }: { backHref: string }) {
  const tBack = useTranslations("home.button")
  const t = useTranslations("submissions.detail")

  return (
    <nav
      className={`${messageDetailStyles.toolbar} ${detailStyles.detailToolbar}`}
      aria-label={t("toolbarAriaLabel")}
    >
      <Link
        noColor
        noUnderline
        href={backHref}
        className={messageDetailStyles.toolbarAction}
        aria-label={tBack("back")}
      >
        <Icon
          icon='chevron_left'
          size='md'
          className={messageDetailStyles.toolbarIcon}
          ariaHidden
        />
        <span className={messageDetailStyles.toolbarLabel}>
          {tBack("back")}
        </span>
      </Link>
    </nav>
  )
}
