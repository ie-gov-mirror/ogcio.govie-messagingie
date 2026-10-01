import { CssSpinner } from "@/components/css-spinner"
import styles from "./inbox-unread-badge.module.css"
import { useInboxUnreadCount } from "./use-inbox-unread-count"

export function InboxUnreadBadge() {
  return <UnreadBadgeView {...useInboxUnreadCount()} />
}

export function UnreadBadgeView({
  count,
  isLoading = false,
}: {
  count: number
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <span className={styles.badge} aria-hidden>
        <CssSpinner size='sm' />
      </span>
    )
  }

  if (count <= 0) {
    return null
  }

  return (
    <span className={styles.badge} aria-hidden>
      {count}
    </span>
  )
}
