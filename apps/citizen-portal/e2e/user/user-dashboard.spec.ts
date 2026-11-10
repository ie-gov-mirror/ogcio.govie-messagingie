import { expect, type Page, test } from "@playwright/test"
import { urls, users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"

const BASE_URL = urls.messaging
const DASHBOARD_URL = urls.dashboard

let page: Page

test.describe("User Dashboard Features", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.citizen1.email)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test("a user can view life events on the dashboard @regression", async () => {
    await page.goto(`${DASHBOARD_URL}`)
    await expect(
      page.getByRole("heading", { name: "Welcome, E2E Citizen User" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Life events" }),
    ).toBeVisible()    
    await expect(page.getByText("View all")).toBeVisible()
  })

  test("clicking view all will take the user to the life events page @regression", async () => {
    await page.goto(`${DASHBOARD_URL}`)
    await expect(
      page.getByRole("heading", { name: "Welcome, E2E Citizen User" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Life events" }),
    ).toBeVisible()    
    await page.getByText("View all").click()
    // `expect(page.url())` is a plain string assertion — it can't wait, so it
    // sampled the URL mid-click. `toHaveURL` retries until the hop lands.
    await expect(page).toHaveURL((url) =>
      url.href.startsWith(`${DASHBOARD_URL}/en/discovery`),
    )
  })

  test("a user can view the latest applications on the dashboard @regression", async () => {
    await page.goto(`${DASHBOARD_URL}`)
    await expect(
      page.getByRole("heading", { name: "Welcome, E2E Citizen User" }),
    ).toBeVisible()
    await expect(page.getByText("Recent applications")).toBeVisible()
  })
 
})
