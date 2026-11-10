"use client"

import { Button } from "@ogcio/design-system-react"
import { useAuth } from "@ogcio/sag-client/react"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { ANALYTICS } from "@/const/analytics"
import { env } from "@/env/env.client"
import { useTrack } from "@/hooks/use-track"

export function ReportButton() {
  const t = useTranslations("accountLinking")
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const track = useTrack()

  const handleReport = useCallback(() => {
    setIsLoading(true)
    track.event(ANALYTICS.accountLinking.report)
    const formURL = new URL(
      env.NEXT_PUBLIC_ERROR_FORM_ID,
      env.NEXT_PUBLIC_FORMS_SERVICE_URL,
    ).toString()
    window.location.href = `${formURL}?userEmail=${encodeURIComponent(user?.email ?? "")}`
  }, [user?.email, track])

  return (
    <Button variant='secondary' disabled={isLoading} onClick={handleReport}>
      {t("report")}
      {isLoading && <CssSpinner />}
    </Button>
  )
}
