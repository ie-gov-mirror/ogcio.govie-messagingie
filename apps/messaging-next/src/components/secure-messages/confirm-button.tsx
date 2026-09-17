"use client"

import { faro, LogLevel } from "@grafana/faro-web-sdk"
import { Button, Spinner, toaster } from "@ogcio/design-system-react"
import { useGatewayMutation } from "@ogcio/sag-client/react"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { TRACE_MESSAGES, TRACES } from "@/const/traces"
import { withFaroSpan } from "@/util/trace-helpers"

interface Profile {
  id: string
  email: string
  primaryUserId: string
  preferredLanguage?: string
}

/**
 * profile-api refuses the link with 400 when the target already signed in
 * (must stay 400). sag-client prefers `details`, else Fastify's `error`
 * field ("Bad Request"), so match status + those message shapes.
 */
function isAlreadyLoggedInLinkError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { status, message } = error as { status?: number; message?: string }
  if (status !== 400) return false
  if (typeof message !== "string") return true
  const lower = message.toLowerCase()
  return (
    lower.includes("already logged in") ||
    lower === "bad request" ||
    lower.startsWith("http error! status: 400")
  )
}

export function ConfirmButton({
  currentUserId,
  targetUserId,
  messageId,
}: {
  currentUserId: string
  targetUserId: string
  messageId: string
}) {
  const t = useTranslations("accountLinking")
  const router = useRouter()
  const pathname = usePathname()
  const [linkBlocked, setLinkBlocked] = useState(false)

  const { trigger, isLoading } = useGatewayMutation<Profile>(
    `/profile/api/v1/profiles/${targetUserId}`,
    { method: "PATCH" },
  )

  const handleConfirm = async () => {
    await withFaroSpan(
      TRACES.CONFIRM_ACCOUNT_LINKING,
      { currentUserId, targetUserId, messageId },
      async () => {
        try {
          const result = await trigger({ primaryUserId: currentUserId })
          faro.api.pushLog([TRACE_MESSAGES.CONFIRM_ACCOUNT_LINKING.SUCCESS], {
            context: { currentUserId, targetUserId, messageId },
          })

          const localePath = pathname.replace(/\/secure-messages$/, "")
          const lang = result?.preferredLanguage
          const base = lang
            ? pathname.replace(/\/[^/]+\/secure-messages$/, `/${lang}`)
            : localePath
          router.replace(`${base}/messages?id=${messageId}`)
        } catch (error) {
          faro.api.pushLog([TRACE_MESSAGES.CONFIRM_ACCOUNT_LINKING.ERROR], {
            level: LogLevel.ERROR,
            context: {
              currentUserId,
              targetUserId,
              messageId,
              error: error instanceof Error ? error.message : String(error),
            },
          })

          const alreadyOwned = isAlreadyLoggedInLinkError(error)
          if (alreadyOwned) {
            setLinkBlocked(true)
          }

          toaster.create({
            title: alreadyOwned
              ? t("error.alreadyOwnedTitle")
              : t("error.linking"),
            description: alreadyOwned
              ? t("error.alreadyOwned")
              : t("error.linkingFailed"),
            dismissible: true,
            duration: 8000,
            position: { x: "right", y: "top" },
            variant: "danger",
          })
        }
      },
    )
  }

  return (
    <Button disabled={isLoading || linkBlocked} onClick={handleConfirm}>
      {t("confirm")}
      {isLoading && <Spinner />}
    </Button>
  )
}
