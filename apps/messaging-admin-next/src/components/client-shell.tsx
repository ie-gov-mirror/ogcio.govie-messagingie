"use client"

import {
  Container,
  Header,
  LoadMaterialSymbols,
  Spinner,
  Stack,
  ToastProvider,
} from "@ogcio/design-system-react"
import {
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME,
  SagClientProvider,
  useAuth,
  usePublicServantGuard,
} from "@ogcio/sag-client/react"
import { useTranslations } from "next-intl"
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react"
import { ApplicationFooter } from "@/components/ApplicationFooter"
import { AnalyticsProviderWrapper } from "@/components/analytics-provider-wrapper"
import { FullWidthContainer, MainContainer } from "@/components/containers"
import { FeatureFlagsProvider } from "@/components/FeatureFlagsProvider"
import { PageHeader } from "@/components/navigation/PageHeader"
import { NotAuthorized } from "@/components/not-authorized"
import SideNav from "@/components/SideNav"
import { UserProvider } from "@/components/UserContext"
import { env } from "@/env/env.client"
import { selectOrganization } from "@/util/gateway-organization"
import {
  persistLastSelectedOrganization,
  readLastSelectedOrganization,
} from "@/util/last-selected-org"

// Logto's sign-in chooser reads this cookie to filter which connector buttons
// to render. We set it to the admin app's connector id (`ogcio-entraid`) so
// public servants never see a MyGovID button on the chooser screen. Mirrors
// the legacy `messaging-admin` behaviour from `@ogcio/authorisation`'s
// `createSetSocialConnectorCookie`.
const LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME = "connectorsToShow"
const SOCIAL_CONNECTOR_COOKIE_MAX_AGE_S = 30
const ADMIN_CONNECTOR_ID = "ogcio-entraid"

/**
 * Read the gateway's currently-selected organization, bypassing the
 * browser/CDN HTTP cache.
 *
 * The shared `getSelectedOrganization` helper issues a plain GET, so a
 * response cached before the user switched org (e.g. the initial
 * `{ organizationId: null }`) can be replayed after `window.location.reload()`.
 * That stale read made the org-selection effect below believe no valid org was
 * selected and reset the selection back to `orgs[0]`, silently reverting every
 * org switch. Mirrors the `cache: "no-store"` read in `use-organization-context`.
 * (AB#38950)
 */
async function readSelectedOrganization(
  gatewayUrl: string,
  appName: string,
): Promise<string | null> {
  try {
    const app = encodeURIComponent(appName)
    const res = await fetch(
      `${gatewayUrl}/auth/selected-organization?app=${app}`,
      {
        credentials: "include",
        cache: "no-store",
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { organizationId?: string | null }
    return data.organizationId ?? null
  } catch {
    return null
  }
}

function getSharedParentDomain(hostname: string): string | undefined {
  if (hostname === "localhost") return undefined
  const parts = hostname.split(".")
  // e.g. messaging-admin.dev.services.gov.ie -> .dev.services.gov.ie
  // e.g. messaging-admin.services.gov.ie     -> .services.gov.ie
  if (parts.length < 3) return undefined
  return `.${parts.slice(1).join(".")}`
}

function setConnectorsToShowCookie(connectorId: string): void {
  if (typeof window === "undefined") return
  const hostname = window.location.hostname
  const isLocal = hostname === "localhost"
  const sharedDomain = getSharedParentDomain(hostname)

  // Clear any stale host-only and shared-domain values first; legacy admin
  // cookies are persisted across apps on the shared domain and a citizen app
  // may have left a `mygovid` value behind.
  // biome-ignore lint/suspicious/noDocumentCookie: cookie must be readable by Logto on a sibling subdomain
  document.cookie = `${LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME}=; max-age=0; path=/`
  if (sharedDomain) {
    // biome-ignore lint/suspicious/noDocumentCookie: cookie must be readable by Logto on a sibling subdomain
    document.cookie = `${LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME}=; max-age=0; path=/; domain=${sharedDomain}`
  }

  const attrs = [
    `${LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME}=${connectorId}`,
    "path=/",
    `max-age=${SOCIAL_CONNECTOR_COOKIE_MAX_AGE_S}`,
    isLocal ? "samesite=lax" : "samesite=none",
    isLocal ? null : "secure",
    sharedDomain ? `domain=${sharedDomain}` : null,
  ]
    .filter(Boolean)
    .join("; ")

  // biome-ignore lint/suspicious/noDocumentCookie: cookie must be readable by Logto on a sibling subdomain
  document.cookie = attrs
}

// Unauthorized users never mount `UserProvider`/org context, so the full
// `PageHeader` (which depends on `useOrganizationContext`) can't be reused. We
// render a minimal branded header whose only action is sign-out, mirroring the
// legacy `messaging-admin` error page that always kept layout + a logout link.
function ForbiddenHeader() {
  const { signOut } = useAuth()
  const t = useTranslations("navigation.header")

  return (
    <Header
      logo={{ href: "/" }}
      items={[
        {
          itemType: "link",
          label: t("drawer.link.logout"),
          href: "#",
          onClick: (e) => {
            e.preventDefault()
            signOut()
          },
        },
      ]}
    />
  )
}

function LayoutLoading() {
  return (
    <output
      aria-label='Loading'
      className='gi-flex gi-items-center gi-justify-center'
      style={{ minHeight: "50vh" }}
    >
      <Spinner size='xl' />
    </output>
  )
}

function ShellContent({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // `citizenRedirectUrl` nudges *true citizens* (zero `organization_roles`)
  // back to the citizen messaging app. Users with org roles for a different
  // service (e.g. Profile PS) get `authorized=false` here and see the
  // NotAuthorized panel below — without that we'd loop with messaging-next's
  // `useOnboardingGuard`, which would classify them as a PS and bounce them
  // straight back.
  const { resolved, authorized } = usePublicServantGuard({
    publicServantRoles: [MESSAGING_PUBLIC_SERVANT_ROLE_NAME],
    citizenRedirectUrl: env.NEXT_PUBLIC_MESSAGING_URL,
  })

  if (!resolved) {
    return <LayoutLoading />
  }

  if (!authorized) {
    return (
      <AuthenticatedShell forbidden={Boolean(user)}>
        <NotAuthorized />
      </AuthenticatedShell>
    )
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>
}

function AuthenticatedShell({
  children,
  forbidden,
}: {
  children: ReactNode
  forbidden?: boolean
}) {
  const { user, claims, loading, signIn } = useAuth()
  const signInTriggered = useRef(false)
  const organizationSelectionStarted = useRef(false)
  const [organizationSelected, setOrganizationSelected] = useState(false)

  // No `connector` is passed: SAG forwards a plain Logto signIn (no
  // `direct_sign_in`) so Logto serves its own sign-in chooser, matching the
  // legacy `messaging-admin` UX. This avoids a silent re-auth through
  // Microsoft's still-active session immediately after sign-out. The
  // `connectorsToShow` cookie tells Logto's chooser to render only the
  // EntraID button — public servants never see MyGovID.
  useEffect(() => {
    if (forbidden) return
    if (!loading && !user && !signInTriggered.current) {
      signInTriggered.current = true
      setConnectorsToShowCookie(ADMIN_CONNECTOR_ID)
      signIn()
    }
  }, [loading, user, signIn, forbidden])

  useEffect(() => {
    if (forbidden) return
    if (organizationSelectionStarted.current) return
    const orgs = claims?.organizations
    if (!orgs || orgs.length === 0) return
    organizationSelectionStarted.current = true
    const userSub = user?.sub
    void (async () => {
      const current = await readSelectedOrganization(
        env.NEXT_PUBLIC_SAG_URL,
        env.NEXT_PUBLIC_SAG_APP_NAME,
      )
      if (current && orgs.includes(current)) {
        // The gateway already has a valid selection (e.g. an in-app org
        // switch just hard-reloaded). Mirror it to local storage so it
        // survives the next logout/login (AB#28623).
        persistLastSelectedOrganization(userSub, current)
        setOrganizationSelected(true)
        return
      }
      // No valid gateway selection — a fresh login. Restore the user's last
      // choice when they still belong to that org; only fall back to the
      // first org when there is no valid saved selection (AB#28623).
      const saved = readLastSelectedOrganization(userSub)
      const target = saved && orgs.includes(saved) ? saved : orgs[0]
      const selected = await selectOrganization(
        env.NEXT_PUBLIC_SAG_URL,
        env.NEXT_PUBLIC_SAG_APP_NAME,
        target,
      )
      if (!selected) return
      persistLastSelectedOrganization(userSub, target)
      setOrganizationSelected(true)
    })()
  }, [claims, forbidden, user])

  if (
    loading ||
    (!forbidden && !user) ||
    (!forbidden && !organizationSelected)
  ) {
    return <LayoutLoading />
  }

  const displayName = user?.name ?? user?.email ?? user?.sub ?? ""

  return (
    <AnalyticsProviderWrapper>
      <FeatureFlagsProvider>
        {!forbidden ? (
          <UserProvider>
            <ToastProvider />
            <Suspense fallback={<LayoutLoading />}>
              <PageHeader
                publicName={displayName}
                config={{
                  profileAdminUrl: env.NEXT_PUBLIC_PROFILE_ADMIN_URL,
                  messagingUrl: env.NEXT_PUBLIC_BASE_URL,
                }}
              />
              <MainContainer>
                <Container>
                  <Stack direction='row' wrap gap={10}>
                    <FullWidthContainer>
                      <Stack direction='row' gap={10} className='sm-wrap'>
                        <SideNav />
                        <FullWidthContainer>{children}</FullWidthContainer>
                      </Stack>
                    </FullWidthContainer>
                  </Stack>
                </Container>
              </MainContainer>
              <ApplicationFooter profileUrl={env.NEXT_PUBLIC_PROFILE_URL} />
            </Suspense>
          </UserProvider>
        ) : (
          <Suspense fallback={<LayoutLoading />}>
            <ForbiddenHeader />
            <MainContainer>
              <Container>{children}</Container>
            </MainContainer>
            <ApplicationFooter profileUrl={env.NEXT_PUBLIC_PROFILE_URL} />
          </Suspense>
        )}
      </FeatureFlagsProvider>
    </AnalyticsProviderWrapper>
  )
}

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <SagClientProvider
      gatewayUrl={env.NEXT_PUBLIC_SAG_URL}
      appName={env.NEXT_PUBLIC_SAG_APP_NAME}
    >
      <LoadMaterialSymbols />
      <ShellContent>{children}</ShellContent>
    </SagClientProvider>
  )
}
