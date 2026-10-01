import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const {
  useAuthMock,
  usePublicServantGuardMock,
  signInMock,
  signOutMock,
  selectOrganizationMock,
} = vi.hoisted(() => {
  // Must run before `@/env/env.client` is evaluated by the module graph below.
  process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3022"
  process.env.NEXT_PUBLIC_SAG_URL ??= "http://localhost:3030"
  process.env.NEXT_PUBLIC_PROFILE_URL ??= "http://localhost:3003"
  process.env.NEXT_PUBLIC_PROFILE_ADMIN_URL ??= "http://localhost:3033"

  return {
    useAuthMock: vi.fn(),
    usePublicServantGuardMock: vi.fn(),
    signInMock: vi.fn(),
    signOutMock: vi.fn(),
    selectOrganizationMock: vi.fn(),
  }
})

vi.mock("@/util/gateway-organization", () => ({
  selectOrganization: (...args: unknown[]) => selectOrganizationMock(...args),
}))

// The shell reads the currently-selected org via `fetch(.../auth/selected-organization,
// { cache: "no-store" })` (AB#38950 — must bypass the cache so a stale read does
// not silently reset the selection). Drive that read through a fetch mock.
let selectedOrgValue: string | null = null
const fetchMock = vi.fn(async (url: unknown) => {
  if (
    typeof url === "string" &&
    url.includes("/auth/selected-organization")
  ) {
    return {
      ok: true,
      json: async () => ({ organizationId: selectedOrgValue }),
    } as Response
  }
  return { ok: true, json: async () => ({}) } as Response
})

vi.mock("@ogcio/sag-client/react", () => ({
  MESSAGING_PUBLIC_SERVANT_ROLE_NAME: "Messaging Public Servant",
  SagClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAuth: () => useAuthMock(),
  usePublicServantGuard: (args: unknown) => usePublicServantGuardMock(args),
}))

type MockHeaderItem = {
  label?: string
  onClick?: React.MouseEventHandler<HTMLElement>
}

vi.mock("@ogcio/design-system-react", () => ({
  Container: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='ds-container'>{children}</div>
  ),
  Header: ({ items }: { items?: MockHeaderItem[] }) => (
    <header data-testid='forbidden-header'>
      {(items ?? []).map((item) => (
        <button
          type='button'
          key={item.label}
          onClick={(e) => item.onClick?.(e)}
        >
          {item.label}
        </button>
      ))}
    </header>
  ),
  LoadMaterialSymbols: () => null,
  Spinner: () => <span data-testid='ds-spinner' />,
  Stack: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='ds-stack'>{children}</div>
  ),
  ToastProvider: () => null,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "drawer.link.logout" ? "Logout" : key,
}))

vi.mock("@/components/ApplicationFooter", () => ({
  ApplicationFooter: () => <footer data-testid='app-footer' />,
}))

vi.mock("@/components/analytics-provider-wrapper", () => ({
  AnalyticsProviderWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("@/components/containers", () => ({
  FullWidthContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MainContainer: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))

vi.mock("@/components/FeatureFlagsProvider", () => ({
  FeatureFlagsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: ({ publicName }: { publicName: string }) => (
    <header data-testid='page-header'>{publicName}</header>
  ),
}))

vi.mock("@/components/not-authorized", () => ({
  NotAuthorized: () => <div data-testid='not-authorized'>not authorized</div>,
}))

vi.mock("@/components/SideNav", () => ({
  __esModule: true,
  default: () => <nav data-testid='side-nav' />,
}))

vi.mock("@/components/UserContext", () => ({
  UserProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

import { ClientShell } from "@/components/client-shell"
import { persistLastSelectedOrganization } from "@/util/last-selected-org"

const defaultAuth = {
  user: undefined as { sub?: string; email?: string; name?: string } | undefined,
  claims: undefined as { organizations?: string[] } | undefined,
  loading: false,
  signIn: signInMock,
  signOut: signOutMock,
}

function clearAllCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ ...defaultAuth })
  usePublicServantGuardMock.mockReturnValue({ resolved: true, authorized: true })
  selectedOrgValue = null
  vi.stubGlobal("fetch", fetchMock)
  selectOrganizationMock.mockResolvedValue(true)
  clearAllCookies()
  // The last-selected-org restore reads localStorage keyed by user sub; wipe
  // it so each test starts from a clean, deterministic state (AB#28623).
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearAllCookies()
  window.localStorage.clear()
})

function selectedOrganizationReadCount(): number {
  return fetchMock.mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/auth/selected-organization"),
  ).length
}

describe("ClientShell — gate states", () => {
  it("renders the loading spinner while the public-servant guard is unresolved", () => {
    useAuthMock.mockReturnValue({ ...defaultAuth, loading: true })
    usePublicServantGuardMock.mockReturnValue({
      resolved: false,
      authorized: false,
    })

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    expect(screen.getByTestId("ds-spinner")).toBeInTheDocument()
    expect(screen.queryByTestId("child")).not.toBeInTheDocument()
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("renders <NotAuthorized /> (without sign-in) when a logged-in user lacks the public-servant role", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuth,
      user: { sub: "u1", name: "Alice" },
      claims: { organizations: [] },
    })
    usePublicServantGuardMock.mockReturnValue({
      resolved: true,
      authorized: false,
    })

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    expect(await screen.findByTestId("not-authorized")).toBeInTheDocument()
    expect(screen.queryByTestId("child")).not.toBeInTheDocument()
    // A user with the wrong role is forbidden — we must NOT re-trigger sign-in.
    expect(signInMock).not.toHaveBeenCalled()
  })

  // AB#40066: a forbidden (logged-in, wrong-role) user previously saw the bare
  // NotAuthorized panel with no header/footer and no way to sign out. The
  // forbidden branch must now render the chrome (header + footer) and a working
  // logout control.
  it("renders header (with logout) and footer for a forbidden user so they can sign out", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuth,
      user: { sub: "u1", name: "Alice" },
      claims: { organizations: [] },
    })
    usePublicServantGuardMock.mockReturnValue({
      resolved: true,
      authorized: false,
    })

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    expect(await screen.findByTestId("not-authorized")).toBeInTheDocument()
    // Layout is present: branded header + footer (previously both missing).
    expect(screen.getByTestId("forbidden-header")).toBeInTheDocument()
    expect(screen.getByTestId("app-footer")).toBeInTheDocument()

    // The logout control works and signs the user out.
    const logout = screen.getByRole("button", { name: "Logout" })
    fireEvent.click(logout)
    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("triggers sign-in exactly once when there is no user and the guard rejects", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuth,
      user: undefined,
      claims: undefined,
      loading: false,
    })
    usePublicServantGuardMock.mockReturnValue({
      resolved: true,
      authorized: false,
    })

    const { rerender } = render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    // No `connector` is passed: SAG forwards a plain Logto signIn (no
    // `direct_sign_in`) so Logto serves its own chooser screen, matching the
    // legacy admin UX and avoiding silent EntraID re-auth after sign-out.
    expect(signInMock).toHaveBeenCalledWith()
    // The `connectorsToShow` cookie scopes Logto's chooser to EntraID only —
    // public servants must never see a MyGovID button on the sign-in page.
    expect(document.cookie).toContain("connectorsToShow=ogcio-entraid")

    // Re-rendering must not re-trigger sign-in (the ref-based guard ensures
    // we don't bounce the user back to Logto on every render cycle).
    rerender(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )
    rerender(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )
    expect(signInMock).toHaveBeenCalledTimes(1)
  })

  it("renders children with chrome (page header + side nav + footer) once authorized and the org is selected", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuth,
      user: { sub: "u1", name: "Alice Wayne" },
      claims: { organizations: ["org-1"] },
    })

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    expect(await screen.findByTestId("child")).toBeInTheDocument()
    expect(screen.getByTestId("page-header")).toHaveTextContent("Alice Wayne")
    expect(screen.getByTestId("side-nav")).toBeInTheDocument()
    expect(screen.getByTestId("app-footer")).toBeInTheDocument()
    expect(signInMock).not.toHaveBeenCalled()
  })
})

describe("ClientShell — organization selection race guard", () => {
  it("does not render protected content when gateway organization selection fails", async () => {
    useAuthMock.mockReturnValue({
      ...defaultAuth,
      user: { sub: "u1", name: "Alice" },
      claims: { organizations: ["org-1"] },
    })
    selectOrganizationMock.mockResolvedValue(false)

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() => expect(selectOrganizationMock).toHaveBeenCalledOnce())
    expect(screen.queryByTestId("child")).not.toBeInTheDocument()
    expect(screen.getByTestId("ds-spinner")).toBeInTheDocument()
    expect(window.localStorage).toHaveLength(0)
  })

  it("calls selectOrganization at most once across re-renders when claims expose orgs", async () => {
    const user = { sub: "u1", name: "Alice" }
    const claims = { organizations: ["org-1", "org-2"] }
    useAuthMock.mockReturnValue({ ...defaultAuth, user, claims })

    const { rerender } = render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    rerender(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )
    rerender(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() => expect(selectedOrganizationReadCount()).toBe(1))
    await waitFor(() =>
      expect(selectOrganizationMock).toHaveBeenCalledWith(
        process.env.NEXT_PUBLIC_SAG_URL,
        "messaging-admin",
        "org-1",
      ),
    )
    expect(selectOrganizationMock).toHaveBeenCalledTimes(1)
  })

  it("does not call selectOrganization when the current selection is already valid", async () => {
    const user = { sub: "u1", name: "Alice" }
    const claims = { organizations: ["org-1", "org-2"] }
    useAuthMock.mockReturnValue({ ...defaultAuth, user, claims })
    selectedOrgValue = "org-2"

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() => expect(selectedOrganizationReadCount()).toBe(1))
    await screen.findByTestId("child")
    expect(selectOrganizationMock).not.toHaveBeenCalled()
  })

  // AB#28623: the gateway clears `sag_selected_org` on sign-out, so on a fresh
  // login the gateway read returns null. Without a durable memory the shell
  // defaulted to orgs[0], reverting the user's choice. We now restore the last
  // selection from localStorage when the user still belongs to that org.
  it("restores the last-selected org from localStorage on fresh login when still a member", async () => {
    const user = { sub: "u1", name: "Alice" }
    const claims = { organizations: ["org-1", "org-2"] }
    useAuthMock.mockReturnValue({ ...defaultAuth, user, claims })
    // Fresh login: gateway cookie was cleared at sign-out.
    selectedOrgValue = null
    // The user previously chose org-2 (persisted before logout).
    persistLastSelectedOrganization("u1", "org-2")

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() =>
      expect(selectOrganizationMock).toHaveBeenCalledWith(
        process.env.NEXT_PUBLIC_SAG_URL,
        "messaging-admin",
        "org-2",
      ),
    )
    expect(selectOrganizationMock).not.toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SAG_URL,
      "messaging-admin",
      "org-1",
    )
  })

  // A saved org the user no longer belongs to must not be restored — we fall
  // back to the first org rather than persisting an inaccessible selection.
  it("ignores a saved org the user no longer has access to and falls back to the first org", async () => {
    const user = { sub: "u1", name: "Alice" }
    const claims = { organizations: ["org-1", "org-2"] }
    useAuthMock.mockReturnValue({ ...defaultAuth, user, claims })
    selectedOrgValue = null
    persistLastSelectedOrganization("u1", "org-stale")

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() =>
      expect(selectOrganizationMock).toHaveBeenCalledWith(
        process.env.NEXT_PUBLIC_SAG_URL,
        "messaging-admin",
        "org-1",
      ),
    )
  })

  it("reads the selected organization with cache:no-store so a switched org is not reverted (AB#38950)", async () => {
    const user = { sub: "u1", name: "Alice" }
    const claims = { organizations: ["org-1", "org-2"] }
    useAuthMock.mockReturnValue({ ...defaultAuth, user, claims })
    // Simulates the post-switch reload: the gateway cookie now holds the
    // user-chosen org. A cached read would have returned the stale pre-switch
    // value and reset the selection back to org-1.
    selectedOrgValue = "org-2"

    render(
      <ClientShell>
        <span data-testid='child'>protected</span>
      </ClientShell>,
    )

    await waitFor(() => expect(selectedOrganizationReadCount()).toBe(1))
    const call = fetchMock.mock.calls.find(
      ([url]) =>
        typeof url === "string" && url.includes("/auth/selected-organization"),
    )
    expect(call?.[1]).toMatchObject({ cache: "no-store" })
    // The valid, freshly-selected org must be preserved, never overwritten.
    expect(selectOrganizationMock).not.toHaveBeenCalled()
  })
})
