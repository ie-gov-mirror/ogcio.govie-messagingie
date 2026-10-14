"use client"

import { Link } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"

export function BackButton() {
  const t = useTranslations("home.button")

  const goBack = useCallback(() => {
    window.history.back()
  }, [])

  return (
    <Link
      noColor
      noUnderline
      iconStart='chevron_left'
      href='#'
      aria-label={t("back")}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault()
        goBack()
      }}
    >
      {t("back")}
    </Link>
  )
}
