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
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME,
  SagClientProvider,
  useAuth,
  usePublicServantGuard,
  useSagClient,
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
import {
  persistLastSelectedOrganization,
  readLastSelectedOrganization,
} from "@/util/last-selected-org"
import { organizationIdsForRole, ZONE_SAG_APP_NAME } from "@/util/zone"

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
  // `inactiveRedirectUrl` is intentionally unset: inactive PS users fall
  // through to NotAuthorized (same as messaging-admin-next).
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
      // we pass the full href ourselves to preserve the path.
      signIn({
        connector: CONNECTOR_ENTRAID,
        redirectUrl: window.location.href,
      })
    }
  }, [loading, user, signIn, forbidden])

  useEffect(() => {
    if (forbidden) return
    if (organizationSelectionStarted.current) return
    const orgs = organizationIdsForRole(
      claims,
      MESSAGING_PUBLIC_SERVANT_ROLE_NAME,
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
      // `sag_selected_org` from profile-admin that this zone cannot
      // use. Restore the user's last messaging-admin choice when they
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
          <UserProvider>
            <ToastProvider />
            <Suspense fallback={<LayoutLoading />}>
              <PageHeader
                publicName={displayName}
                config={{
                  // Required in production via env schema; set in .env.sample for local.
                  profileAdminUrl: env.NEXT_PUBLIC_PROFILE_ADMIN_URL ?? "",
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
              <ApplicationFooter
                profileUrl={env.NEXT_PUBLIC_PROFILE_URL ?? ""}
              />
            </Suspense>
          </UserProvider>
        ) : (
          <Suspense fallback={<LayoutLoading />}>
            <ForbiddenHeader />
            <MainContainer>
              <Container>{children}</Container>
            </MainContainer>
            <ApplicationFooter profileUrl={env.NEXT_PUBLIC_PROFILE_URL ?? ""} />
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
      appName={ZONE_SAG_APP_NAME["messaging-admin"]}
    >
      <LoadMaterialSymbols />
      <ShellContent>{children}</ShellContent>
    </SagClientProvider>
  )
}
