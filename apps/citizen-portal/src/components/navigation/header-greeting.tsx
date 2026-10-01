"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import styles from "./page-header.module.css"

/**
 * The span inside a `HeaderMenuItemSlot`. The slot has to stay a direct
 * child of `HeaderSecondaryMenu`; that menu drops any other child.
 */
export function HeaderGreeting({
  name,
  onSignOut,
}: {
  name: ReactNode
  onSignOut: () => void
}) {
  const t = useTranslations("navigation.header")
  const userMenuT = useTranslations("navigation.userMenu")

  return (
    <span className={styles.greeting}>
      {t("greetingPrefix")} {name}
      {" ("}
      <button type='button' className={styles.logout} onClick={onSignOut}>
        {userMenuT("logout")}
      </button>
      {")"}
    </span>
  )
}
