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

const profileAdminRoot =
  process.env.PROFILE_ADMIN_URL?.replace(/\/$/, "") ||
  "https://profile-admin.dev.services.gov.ie"

export const urls = Object.freeze({
  admin: process.env.ADMIN_URL || "http://localhost:3001",
  auth: process.env.AUTH_URL || "http://localhost:3001",
  authSignIn:
    process.env.E2E_AUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "https://authorization.dev.services.gov.ie/sign-in",
  mock:
    process.env.MOCK_URL || "https://mock-login-service.dev.services.gov.ie",
  profileAdminRoot,
  profileAdmin: `${profileAdminRoot}/en`,
  profileService:
    process.env.PROFILE_SERVICE_URL || "https://profile.dev.services.gov.ie",
})

export const templates = Object.freeze({
  e2e: "Test Template E2E",
  playwrightPrefix: "Playwright Template name",
})

export const contacts = Object.freeze({
  recipient: Object.freeze({ email: "alejandro.gonzales@mail.ie" }),
})
