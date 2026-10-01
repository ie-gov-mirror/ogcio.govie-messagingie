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
  PROFILE_PUBLIC_SERVANT_ROLE_NAME,
  SagClientProvider,
  useAuth,
  usePublicServantGuard,
  useSagClient,
} from "@ogcio/sag-client/react"
import { useTranslations } from "next-intl"
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react"
import { AnalyticsProviderWrapper } from "@/components/profile-admin/analytics-provider-wrapper"
import { FeatureFlagsProvider } from "@/components/profile-admin/feature-flags-provider"
import { ApplicationFooter } from "@/components/profile-admin/layout/application-footer"
import { MainContainer } from "@/components/profile-admin/layout/containers"
import { PageHeader } from "@/components/profile-admin/navigation/page-header"
import { NotAuthorized } from "@/components/profile-admin/not-authorized"
import { env } from "@/env/env.client"
import {
  persistLastSelectedOrganization,
  readLastSelectedOrganization,
} from "@/util/profile-admin/last-selected-org"
import { organizationIdsForRole, ZONE_SAG_APP_NAME } from "@/util/zone"

// Logto's sign-in chooser reads this cookie to filter which connector buttons
// to render. We set it to the admin app's connector id (`ogcio-entraid`) so
// public servants never see a MyGovID button on the chooser screen. Mirrors
// the legacy `profile-admin` behaviour from `@ogcio/authorisation`'s
// `createSetSocialConnectorCookie`.
const LOGTO_SOCIAL_CONNECTOR_ID_COOKIE_NAME = "connectorsToShow"
const SOCIAL_CONNECTOR_COOKIE_MAX_AGE_S = 30
const ADMIN_CONNECTOR_ID = "ogcio-entraid"

function getSharedParentDomain(hostname: string): string | undefined {
  if (hostname === "localhost") return undefined
  const parts = hostname.split(".")
  // e.g. profile-admin.dev.services.gov.ie -> .dev.services.gov.ie
  // e.g. profile-admin.services.gov.ie     -> .services.gov.ie
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

// Unauthorized users never mount org context, so the full `PageHeader`
// (which depends on `useOrganizationContext`) can't be reused. Minimal
// branded header whose only action is sign-out — mirrors messaging shell.
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
  // `citizenRedirectUrl` (not `unauthorizedRedirectUrl`) means we only nudge
  // *true citizens* — zero `organization_roles` — back to the citizen app.
  // Users who hold an org role for a different service (e.g. Messaging PS)
  // get `authorized=false` here and see the NotAuthorized panel below,
  // which avoids the cross-app redirect loop with profile-next.
  // `inactiveRedirectUrl` is intentionally unset: inactive PS users fall
  // through to NotAuthorized (same as messaging-admin-next / messaging shell).
  const { resolved, authorized } = usePublicServantGuard({
    publicServantRoles: [PROFILE_PUBLIC_SERVANT_ROLE_NAME],
    citizenRedirectUrl: env.NEXT_PUBLIC_PROFILE_URL,
  })

  if (!resolved) {
    return <LayoutLoading />
  }

  // `forbidden={Boolean(user)}` keeps the sign-in flow for unauthenticated
  // visitors (the guard no longer redirects them when `citizenRedirectUrl`
  // is set) while still rendering NotAuthorized for authenticated users
  // who lack the Profile-PS role.
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
  const { user, claims, loading, signIn, signOut } = useAuth()
  const client = useSagClient()
  const signInTriggered = useRef(false)
  const organizationSelectionStarted = useRef(false)
  const [organizationSelected, setOrganizationSelected] = useState(false)

  // No `connector` is passed: SAG forwards a plain Logto signIn (no
  // `direct_sign_in`) so Logto serves its own sign-in chooser, matching the
  // legacy `profile-admin` UX. This avoids a silent re-auth through
  // Microsoft's still-active session immediately after sign-out. The
  // `connectorsToShow` cookie tells Logto's chooser to render only the
  // EntraID button — public servants never see MyGovID.
  useEffect(() => {
    if (forbidden) return
    if (!loading && !user && !signInTriggered.current) {
      signInTriggered.current = true
      setConnectorsToShowCookie(ADMIN_CONNECTOR_ID)
      // Explicit redirectUrl: Referer is trimmed to origin-only on the
      // cross-subdomain POST to SAG (strict-origin-when-cross-origin), so
      // deep links like /en from messaging-admin would otherwise round-trip
      // through / and land on service-users.
      signIn({ redirectUrl: window.location.href })
    }
  }, [loading, user, signIn, forbidden])

  // Persist the user's organization on the gateway via the
  // `sag_selected_org` signed cookie. The Secure API Gateway only forwards
  // organization-scoped admin scopes (e.g. `profile:user.admin:read`) when
  // the proxy request resolves an organization id from this cookie or the
  // `X-Organization-Id` header. We must complete this round-trip *before*
  // children mount and fire their first SWR fetches — otherwise those
  // requests proxy with a resource-scoped token that lacks admin scopes
  // and the gateway returns 403.
  //
  // Honor any pre-existing selection (e.g. set by the in-app org switcher
  // before a hard reload) as long as it's still one of the user's claims.
  // Only fall back to `claims.organizations[0]` when no valid selection is
  // persisted yet, so switching orgs actually sticks across the reload.
  useEffect(() => {
    if (forbidden) return
    if (organizationSelectionStarted.current) return
    const orgs = organizationIdsForRole(
      claims,
      PROFILE_PUBLIC_SERVANT_ROLE_NAME,
    )
    if (orgs.length === 0) return
    organizationSelectionStarted.current = true
    const userSub = user?.sub
    void (async () => {
      const current = await client.getSelectedOrganization()
      if (current && orgs.includes(current)) {
        // The gateway already has a valid selection (e.g. an in-app org
        // switch just hard-reloaded). Mirror it to local storage so it
        // survives the next logout/login (AB#28623).
        persistLastSelectedOrganization(userSub, current)
        setOrganizationSelected(true)
        return
      }
      // No valid gateway selection — a fresh login, or a leftover
      // `sag_selected_org` from messaging-admin that this zone cannot
      // use. Restore the user's last profile-admin choice when they
      // still belong to that org; only fall back to the first eligible
      // org when there is no valid saved selection (AB#28623).
      const saved = readLastSelectedOrganization(userSub)
      const target = saved && orgs.includes(saved) ? saved : orgs[0]
      const selected = await client.selectOrganization(target)
      if (!selected) return
      persistLastSelectedOrganization(userSub, target)
      setOrganizationSelected(true)
    })()
  }, [claims, client, forbidden, user])

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
          <>
            <ToastProvider />
            <Suspense fallback={<LayoutLoading />}>
              <PageHeader publicName={displayName} onSignOut={signOut} />
              <MainContainer>
                <Container>
                  <Stack direction='row' wrap gap={10}>
                    <div style={{ width: "100%" }}>{children}</div>
                  </Stack>
                </Container>
              </MainContainer>
              <ApplicationFooter />
            </Suspense>
          </>
        ) : (
          <Suspense fallback={<LayoutLoading />}>
            <ForbiddenHeader />
            <MainContainer>
              <Container>{children}</Container>
            </MainContainer>
            <ApplicationFooter />
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
      appName={ZONE_SAG_APP_NAME["profile-admin"]}
    >
      <LoadMaterialSymbols />
      <ShellContent>{children}</ShellContent>
    </SagClientProvider>
  )
}
