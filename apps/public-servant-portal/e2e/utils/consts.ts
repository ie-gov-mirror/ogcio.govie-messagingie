import { urls } from "../fixtures"

export const PROFILE_URL = urls.profileAdmin
export const SERVICE_USERS_URL = `${PROFILE_URL}/service-users`
export const WAIT_TIME = 2000

export const TEST_DATA = {
  providerHost: "Test provider host",
  providerTestValue: "Test provider value", //this value is for the provider password field//
  templateSubject: "Test Subject",
  templateRichText: "Test rich text",
  templatePlainText: "Test plain text",
}
