"use client"

import { toaster } from "@ogcio/design-system-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import type { RestoreEraseResult } from "./use-restore-erase-messages"

export type RestoreEraseAction = "restore" | "erase"

export interface RestoreEraseResultToastProps {
  action: RestoreEraseAction
  result: RestoreEraseResult | null
  onDismiss: () => void
}

/** Headless toast for the outcome of a Restore or Erase attempt. */
export function RestoreEraseResultToast({
  action,
  result,
  onDismiss,
}: RestoreEraseResultToastProps) {
  const tRestore = useTranslations("home.restore.alert")
  const tErase = useTranslations("home.erase.alert")
  const t = action === "restore" ? tRestore : tErase

  useEffect(() => {
    if (!result) return
    const count = result.ids.length
    const toastProps = {
      title: result.ok ? t("success", { count }) : t("failure", { count }),
      variant: result.ok ? ("success" as const) : ("danger" as const),
      dismissible: true,
      duration: result.ok ? 5_000 : 8_000,
      position: { x: "right" as const, y: "top" as const },
      "data-testid": `${action}-${result.ok ? "success" : "failure"}-toast`,
    }
    toaster.create(toastProps)
    onDismiss()
  }, [result, t, action, onDismiss])

  return null
}
