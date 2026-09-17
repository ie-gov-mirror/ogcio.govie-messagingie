"use client"

import { useEnv } from "@citizen-portal/shared"
import { Heading, Link, Paragraph, Stack } from "@ogcio/design-system-react"
import {
  CONNECTOR_MYGOVID,
  useAuth,
  useGatewayFetch,
  useSagClient,
} from "@ogcio/sag-client/react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { CssSpinner } from "@/components/css-spinner"
import { env } from "@/env/env.client"
import { getTrustedRedirectOrigins } from "@/util/trusted-redirect-origins"
import { resolveOnboardingSource } from "./resolve-onboarding-source"

const GOV_IE_SAFE_REGISTRATION_URL =
  "https://www.gov.ie/en/department-of-social-protection/publications/safe-registration-and-the-public-services-card-psc/"

const POLL_INTERVAL = 3000
const MAX_POLL_TIME = 60000

type OnboardingStatus =
  | "idle"
  | "assigning_role"
  | "role_assigned"
  | "insufficient_safe_level"
  | "not_authorized"
  | "error"

interface OnboardingErrorBody {
  error?: string
  message?: string
  safeLevel?: number
  required?: number
}

function isInsufficientSafeLevelResponse(
  status: number,
  data: OnboardingErrorBody,
): boolean {
  if (status !== 403) return false
  if (typeof data.safeLevel === "number") return true
  if (typeof data.required === "number") return true
  const combined = `${data.message ?? ""} ${data.error ?? ""}`.toLowerCase()
  return combined.includes("safe level")
}

interface ProfileResponse {
  id: string
}

function OnboardingPanel({
  children,
  label = "Onboarding",
}: {
  children: React.ReactNode
  label?: string
}) {
  return (
    <output aria-label={label}>
      <Stack direction='column' gap={5}>
        {children}
      </Stack>
    </output>
  )
}

function OnboardingContent() {
  const t = useTranslations("onboard")
  const { user } = useAuth()
  const searchParams = useSearchParams()
  // Use the SAG client from the enclosing OnboardingShell provider, NOT the
  // app-level env. The shell runs the provider as the `profile` app (session +
  // sign-in bind to `profile`), so the onboarding POST must send the SAME app
  // in `X-Application`. Reading `sagAppName` from env instead sent
  // `citizen-portal`, which the gateway's strict per-app match rejected with a
  // 401 against the profile-bound session (AB#40235).
  const client = useSagClient()
  const { hosts } = useEnv()
  const source = resolveOnboardingSource(
    searchParams.get("source"),
    getTrustedRedirectOrigins(hosts),
  )

  const [status, setStatus] = useState<OnboardingStatus>("idle")
  const [timedOut, setTimedOut] = useState(false)
  const startTimeRef = useRef(Date.now())
  const redirectingRef = useRef(false)
  const onboardingTriggered = useRef(false)

  const profilePath =
    user?.sub && status === "role_assigned"
      ? `/profile/api/v1/profiles/${user.sub}`
      : null
  const { data: profile, refresh } =
    useGatewayFetch<ProfileResponse>(profilePath)

  useEffect(() => {
    if (!user?.sub || onboardingTriggered.current) return
    onboardingTriggered.current = true

    setStatus("assigning_role")
    fetch(`${client.gatewayUrl}/profile/api/v1/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Application": client.appName,
      },
      body: "{}",
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("role_assigned")
          return
        }
        const data = (await res.json().catch(() => ({}))) as OnboardingErrorBody
        if (isInsufficientSafeLevelResponse(res.status, data)) {
          setStatus("insufficient_safe_level")
        } else if (res.status === 403) {
          setStatus("not_authorized")
        } else {
          setStatus("error")
        }
      })
      .catch(() => {
        setStatus("error")
      })
  }, [user?.sub, client.gatewayUrl, client.appName])

  useEffect(() => {
    if (status !== "role_assigned") return
    const redirectTarget = source ?? env.NEXT_PUBLIC_BASE_URL
    if (profile?.id && redirectTarget && !redirectingRef.current) {
      redirectingRef.current = true
      window.location.href = redirectTarget
    }
  }, [profile, source, status])

  useEffect(() => {
    if (status !== "role_assigned") return
    if (profile?.id) return

    const interval = setInterval(() => {
      if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
        setTimedOut(true)
        clearInterval(interval)
        return
      }
      refresh()
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [status, profile, refresh])

  const handleRefresh = useCallback(() => {
    setTimedOut(false)
    startTimeRef.current = Date.now()
    refresh()
  }, [refresh])

  if (status === "insufficient_safe_level") {
    return (
      <OnboardingPanel>
        <Heading>{t("heading.main")}</Heading>
        <Paragraph>
          {t.rich("paragraph.safeLevel2", {
            link: (chunks) => (
              <Link
                href={GOV_IE_SAFE_REGISTRATION_URL}
                className='gi-link'
                external
              >
                {chunks}
              </Link>
            ),
          })}
        </Paragraph>
      </OnboardingPanel>
    )
  }

  if (status === "not_authorized") {
    return (
      <OnboardingPanel>
        <Paragraph>
          Unable to verify your identity. Please try signing in again.
        </Paragraph>
      </OnboardingPanel>
    )
  }

  if (status === "error") {
    return (
      <OnboardingPanel>
        <Paragraph>
          Something went wrong during onboarding. Please try again.
        </Paragraph>
        <button
          type='button'
          onClick={() => window.location.reload()}
          className='gi-btn gi-btn-primary'
        >
          Try again
        </button>
      </OnboardingPanel>
    )
  }

  if (status === "role_assigned" && timedOut) {
    return (
      <OnboardingPanel>
        <Paragraph>
          Profile creation is taking longer than expected. Please refresh.
        </Paragraph>
        <button
          type='button'
          onClick={handleRefresh}
          className='gi-btn gi-btn-primary'
        >
          Refresh
        </button>
      </OnboardingPanel>
    )
  }

  return (
    <OnboardingPanel>
      <CssSpinner size='xl' />
      <Paragraph>
        {status === "assigning_role"
          ? "Verifying your identity..."
          : "Waiting for your profile to be created..."}
      </Paragraph>
    </OnboardingPanel>
  )
}

function OnboardingInner() {
  const { user, loading, signIn } = useAuth()
  const signInTriggered = useRef(false)

  useEffect(() => {
    if (!loading && !user && !signInTriggered.current) {
      signInTriggered.current = true
      signIn({
        connector: CONNECTOR_MYGOVID,
        redirectUrl: window.location.href,
      })
    }
  }, [loading, user, signIn])

  if (loading || !user) {
    return (
      <OnboardingPanel>
        <CssSpinner size='xl' />
      </OnboardingPanel>
    )
  }

  return <OnboardingContent />
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <OnboardingPanel>
          <CssSpinner size='xl' />
        </OnboardingPanel>
      }
    >
      <OnboardingInner />
    </Suspense>
  )
}
