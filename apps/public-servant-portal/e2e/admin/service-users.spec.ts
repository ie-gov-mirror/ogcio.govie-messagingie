import { Buffer } from "node:buffer"
import { randomInt } from "node:crypto"
import path from "node:path"
import { expect, type Locator, type Page, test } from "@playwright/test"
import { urls } from "../fixtures"
import { authenticateUser } from "../helpers/auth"
import { createPageWithVideo } from "../helpers/browser-context"

const SERVICE_USERS_URL = `${urls.profileAdmin}/service-users`
const TEST_CSV_BLANK_FILENAME = "service-users-blank.csv"
const TEST_CSV_INCORRECT_FILENAME = "service-users-incorrect.csv"
const TEST_CSV_XSS_FILENAME = "service-users-xss.csv"
const PPSN_CHECK_CHARACTERS = "WABCDEFGHIJKLMNOPQRSTUV"

let page: Page

function createPpsn() {
  const digits = Array.from({ length: 7 }, () => randomInt(10))
  const checksum = digits.reduce(
    (sum, digit, index) => sum + digit * (8 - index),
    0,
  )
  return `${digits.join("")}${PPSN_CHECK_CHARACTERS[checksum % 23]}`
}

function createServiceUserImport(partial = false) {
  const id = crypto.randomUUID()
  const firstName = "E2E"
  const lastName = `ServiceUser${id}`
  const email = `e2e-service-user-${id}@example.com`
  const ppsn = createPpsn()
  const fileName = `service-users-${id}.csv`
  const header = partial
    ? "firstName,lastName,email"
    : "firstName,lastName,email,phone,address,city,dateOfBirth,ppsn,preferredLanguage"
  const row = partial
    ? `${firstName},${lastName},${email}`
    : `${firstName},${lastName},${email},+353 1234567,123 Test Street,Dublin,1990-01-01,${ppsn},en`

  return {
    email,
    fileName,
    firstName,
    lastName,
    ppsn,
    file: {
      name: fileName,
      mimeType: "text/csv",
      buffer: Buffer.from(`${header}\n${row}`),
    },
  }
}

/**
 * Type into one of the Service Users search boxes and submit it.
 *
 * Located by placeholder rather than accessible name on purpose: both search
 * inputs render `aria-label="Search"` (from the `<key>.search.button` message),
 * so `getByRole("textbox", { name: "Search Imports" })` matches nothing and the
 * call blocks for the entire test timeout. There is also no "Search" button —
 * the field debounces on change and submits on Enter — so clicking one blocked
 * just as long.
 */
async function searchIn(page: Page, placeholder: string, term: string) {
  const box = page.getByPlaceholder(placeholder)
  await box.fill(term)
  await box.press("Enter")
}

type TabName = "Service Users" | "Imports" | "Import CSV"

/**
 * Content that proves a tab's panel is rendered and usable, not merely marked
 * selected. The panels are hidden with CSS rather than the `hidden` attribute,
 * so an element can resolve from the DOM while still not displayed.
 */
function tabPanelReady(page: Page, name: TabName): Locator {
  switch (name) {
    case "Service Users":
      return page.getByPlaceholder("Search Service Users")
    case "Imports":
      return page.getByPlaceholder("Search Imports")
    case "Import CSV":
      return page.getByRole("button", { name: "Upload", exact: true })
  }
}

/**
 * Select one of the Service Users tabs and wait until its panel is usable.
 */
async function openTab(page: Page, name: TabName) {
  const tab = page.getByRole("tab", { name, exact: true })
  await expect(tab).toBeVisible({ timeout: 5000 })
  // Playwright's pointer click can stall before dispatching the DOM event.
  await tab.evaluate((element) => element.click())
  await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 5000 })
  await expect(tabPanelReady(page, name)).toBeVisible({ timeout: 5000 })
}

/**
 * Return to the Service Users list from an import detail page.
 *
 * "Back" is a client-side navigation and the tablist re-renders behind it.
 * Touching a tab before that settles is what left earlier runs waiting on
 * elements that existed but were not yet displayed.
 */
async function backToList(page: Page) {
  await page
    .getByText("Back", { exact: true })
    .click({ timeout: 5000, noWaitAfter: true })
  await expect(
    page.getByRole("heading", { name: /service users/i }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByRole("tab", { name: "Service Users", exact: true }),
  ).toBeVisible({ timeout: 30_000 })
}

async function submitUpload(page: Page) {
  const button = page.getByRole("button", { name: "Upload", exact: true })
  await expect(button).toBeEnabled({ timeout: 5000 })
  await button.evaluate((element) => element.form?.requestSubmit(element))
}

async function uploadServiceUser(
  page: Page,
  serviceUser: ReturnType<typeof createServiceUserImport>,
) {
  await page.goto(SERVICE_USERS_URL)
  await openTab(page, "Import CSV")
  await page.locator('input[type="file"]').setInputFiles(serviceUser.file)
  // Playwright's pointer click can stall before dispatching the form submit,
  // so submit the same enabled form without navigation auto-waiting.
  await submitUpload(page)
  await expect(page.getByText("File uploaded successfully.")).toBeVisible({
    timeout: 5000,
  })
  await expect(
    page.getByRole("heading", { name: "Service User Import Detail" }),
  ).toBeVisible({ timeout: 5000 })
}

async function waitForServiceUser(page: Page, email: string) {
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(async () => {
    await page.goto(
      `${SERVICE_USERS_URL}?profiles=${encodeURIComponent(email)}`,
    )
    await expect(row).toBeVisible()
  }).toPass({ timeout: 60_000 })
  return row
}

test.describe("Admin Service Users Import Tests", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createPageWithVideo(browser)
    await authenticateUser(page)
    await page.goto(SERVICE_USERS_URL)
    await expect(
      page.getByRole("heading", { name: /service users/i }),
    ).toBeVisible()
  })

  test.afterAll(async () => {
    // A wedged browser action must not get a second full test timeout to close.
    test.setTimeout(5000)
    await page.close()
  })

  test("an admin can upload service users @regression", async () => {
    const serviceUser = createServiceUserImport()

    await uploadServiceUser(page, serviceUser)

    await expect(
      page.getByRole("cell", { name: new RegExp(serviceUser.email) }),
    ).toBeVisible()
    await backToList(page)

    // Click the Imports tab
    await openTab(page, "Imports")

    await searchIn(page, "Search Imports", serviceUser.fileName)

    await expect(
      page.getByRole("row", { name: serviceUser.fileName }).first(),
    ).toBeVisible()

    await page
      .getByRole("row", { name: serviceUser.fileName })
      .first()
      .getByRole("link")
      .click({ timeout: 5000, noWaitAfter: true })

    await expect(
      page.getByRole("heading", { name: "Service User Import Detail" }),
    ).toBeVisible()
    await expect(async () => {
      await page.reload()
      await expect(
        page.getByRole("cell", { name: new RegExp(serviceUser.email) }),
      ).toBeVisible()
    }).toPass()
    const serviceUserRow = await waitForServiceUser(page, serviceUser.email)
    await expect(serviceUserRow).toContainText(serviceUser.email)
    await expect(serviceUserRow).toContainText(serviceUser.ppsn)
    await expect(serviceUserRow).toContainText(serviceUser.firstName)
    await expect(serviceUserRow).toContainText(serviceUser.lastName)
  })

  test("an admin can upload service users using partial data @regression", async () => {
    const serviceUser = createServiceUserImport(true)

    await uploadServiceUser(page, serviceUser)
    await expect(
      page.getByRole("cell", { name: new RegExp(serviceUser.email) }),
    ).toBeVisible()
    await backToList(page)

    // Click the Imports tab
    await openTab(page, "Imports")

    await searchIn(page, "Search Imports", serviceUser.fileName)

    // Make sure the file name appears in the table
    await expect(
      page.getByRole("row", { name: serviceUser.fileName }).first(),
    ).toBeVisible()

    const serviceUserRow = await waitForServiceUser(page, serviceUser.email)
    await expect(serviceUserRow).toContainText(serviceUser.email)
    await expect(serviceUserRow).toContainText(serviceUser.firstName)
    await expect(serviceUserRow).toContainText(serviceUser.lastName)
  })

  test("an admin cannot upload a blank import @regression", async () => {
    const csvPath = path.join(__dirname, TEST_CSV_BLANK_FILENAME)

    await openTab(page, "Import CSV")
    await page.locator('input[type="file"]').setInputFiles(csvPath)
    await submitUpload(page)
    // Expect upload to be blocked - should NOT see success message
    await expect(
      page.getByText("File uploaded successfully."),
    ).not.toBeVisible()
  })

  test("an admin cannot upload an incorrect import @regression", async () => {
    const csvPath = path.join(__dirname, TEST_CSV_INCORRECT_FILENAME)

    await openTab(page, "Import CSV")
    await page.locator('input[type="file"]').setInputFiles(csvPath)
    await submitUpload(page)

    // Expect upload to be blocked - should NOT see success message
    await expect(
      page.getByText("File uploaded successfully."),
    ).not.toBeVisible()
  })

  test("an admin cannot upload a file with XSS content @regression", async () => {
    const csvPath = path.join(__dirname, TEST_CSV_XSS_FILENAME)

    await openTab(page, "Import CSV")
    await page.locator('input[type="file"]').setInputFiles(csvPath)
    await submitUpload(page)

    // Expect upload to be blocked - should NOT see success message
    await expect(
      page.getByText("File uploaded successfully."),
    ).not.toBeVisible()
  })

  test.describe("Admin Service Users Edit Test @regression", () => {
    test("an admin can edit a service user @regression", async () => {
      const serviceUser = createServiceUserImport(true)
      await uploadServiceUser(page, serviceUser)
      const serviceUserRow = await waitForServiceUser(page, serviceUser.email)
      await serviceUserRow.getByText("Edit").click()
      await page.locator('input[name="firstName"]').fill("Test")
      //add uuid to the name to make it unique
      const uuid = crypto.randomUUID()
      await page.locator('input[name="lastName"]').fill(`User${uuid}`)
      await page.getByRole("button", { name: "Update" }).click()
      await backToList(page)
      await searchIn(page, "Search Service Users", uuid)
      await expect(
        page.getByRole("cell", { name: `User${uuid}` }),
      ).toBeVisible()
    })
  })
})
