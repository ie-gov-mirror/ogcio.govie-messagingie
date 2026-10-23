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
  CONNECTOR_ENTRAID,
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

  // Pass the Entra connector so SAG maps it to Logto `direct_sign_in`.
  // The connector now sends `prompt=select_account`, so an active Microsoft
  // session shows the account picker instead of silently reauthenticating.
  useEffect(() => {
    if (forbidden) return
    if (!loading && !user && !signInTriggered.current) {
      signInTriggered.current = true
      // Explicit redirectUrl: Referer is trimmed to origin-only on the
      // cross-subdomain POST to SAG (strict-origin-when-cross-origin), so
      // deep links like /en from messaging-admin would otherwise round-trip
      // through / and land on service-users.
      signIn({
        connector: CONNECTOR_ENTRAID,
        redirectUrl: window.location.href,
      })
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
