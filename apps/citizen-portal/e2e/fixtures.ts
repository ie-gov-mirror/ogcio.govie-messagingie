import aliceWayne from "./helpers/existingUsers/aliceWayne.json"
import andrewParker from "./helpers/existingUsers/andrewParker.json"
import e2eCitizen1 from "./helpers/existingUsers/e2e_citizen_1.json"
import e2ePublicServant1 from "./helpers/existingUsers/e2e_ps_1.json"
import edwardStark from "./helpers/existingUsers/edwardStark.json"
import johnDoe from "./helpers/existingUsers/johnDoe.json"

type Identity = {
  sub: string
  providerData: {
    firstName: string
    lastName: string
    email: string
  }
}

export class PortalUser {
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly logtoId: string
  readonly password: string

  constructor(
    identity: Identity,
    password = process.env.E2E_USER_PASSWORD ?? "demo",
  ) {
    this.email = identity.providerData.email
    this.firstName = identity.providerData.firstName
    this.lastName = identity.providerData.lastName
    this.logtoId = identity.sub
    this.password = password
  }

  get displayName() {
    return `${this.firstName} ${this.lastName}`
  }

  get username() {
    return this.email.split("@")[0]
  }
}

export const users = Object.freeze({
  citizen1: new PortalUser(e2eCitizen1),
  publicServant1: new PortalUser(e2ePublicServant1),
  peterParker: new PortalUser(andrewParker),
  johnDoe: new PortalUser(johnDoe),
  bruceWayne: new PortalUser(aliceWayne),
  tonyStark: new PortalUser(edwardStark),
})

export function getUserByEmail(email: string) {
  return Object.values(users).find((user) => user.email === email)
}

const dockerPort = process.env.DOCKER_PORT ?? "8080"

export const urls = Object.freeze({
  messaging: process.env.BASE_URL || "http://localhost:3001",
  localMessaging: process.env.BASE_URL ?? "http://localhost:4001",
  admin: process.env.ADMIN_URL || "http://localhost:3001",
  mock: process.env.MOCK_URL || "http://localhost:3005",
  profile: process.env.PROFILE_URL || "http://localhost:3003",
  profileVisual: process.env.PROFILE_URL || "http://localhost:3004",
  dashboard: process.env.DASHBOARD_URL || "http://localhost:3004",
  dashboardVisual: process.env.DASHBOARD_URL || "http://localhost:3003",
  profileAdmin: "https://profile-admin.dev.services.gov.ie/en",
  profileService:
    process.env.PROFILE_HOST ?? "https://profile.dev.services.gov.ie",
  docker: Object.freeze({
    port: dockerPort,
    messaging: `http://messaging.local.test:${dockerPort}`,
    profile: `http://profile.local.test:${dockerPort}`,
    dashboard: `http://dashboard.local.test:${dockerPort}`,
    loopback: `http://127.0.0.1:${dockerPort}`,
  }),
  crossZone: Object.freeze({
    messages: process.env.MESSAGING_HOST ?? "http://messaging.local.test:8080",
    profile: process.env.PROFILE_HOST ?? "http://profile.local.test:8080",
    dashboard:
      process.env.DASHBOARD_HOST ?? "http://dashboard.local.test:8080",
  }),
})

export const ids = Object.freeze({
  secureMessage: "becb3e86-6a5c-48e1-8bf7-c1cb884df69c",
  canonicalSecureMessage: "0494ff56-58b0-47c7-9868-8446b242863f",
  mockMessage: "test-message-id",
  mockUser: "test-user-id",
  demoMessage: "00000001-0000-4000-8000-000000000001",
  demoMessageSecondary: "00000001-0000-4000-8000-000000000002",
  demoPdfAttachment: "10000001-0000-4000-8000-000000000001",
  demoZipAttachment: "10000001-0000-4000-8000-000000000002",
  organisationPrimary: "org-1",
  organisationSecondary: "org-2",
  organisationEducation: "org-edu",
})

export const contacts = Object.freeze({
  announcementRecipient: Object.freeze({
    email: users.citizen1.email,
  }),
  variableRecipient: Object.freeze({
    // Must be the same identity that reads the message back, and must be opted
    // in to messaging: an opted-out contact still resolves in search but
    // renders its "Add recipient" button disabled.
    email: users.peterParker.email,
  }),
})

export const templates = Object.freeze({
  e2e: "Test Template E2E",
  playwrightPrefix: "Playwright Template name",
})
