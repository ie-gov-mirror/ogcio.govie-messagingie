import { expect, type Page, test } from "@playwright/test"
import { urls, users } from "../fixtures"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import { navigateAndVerifyHeading, navigateAndVerifySearch } from "../utils/navigation-helpers"
import link from "next/dist/client/link"

const DASHBOARD_URL = urls.dashboard

let page: Page

test.describe("User Discovery page", () => {
  test.beforeAll(async ({ browser }) => {
    page = await createAuthenticatedPage(browser, users.peterParker.email)})

  test.afterAll(async () => {
    await page.close()
  })

    test("a user can view the discovery page @regression", async () => {

      await page.goto(`${DASHBOARD_URL}/en/discovery`)
      await expect(page).toHaveURL(`${DASHBOARD_URL}/en/discovery`)
    })

    test("a user can view all discovery pages without errors @regression", async () => {

      await navigateAndVerifyHeading(
          page,
          `${DASHBOARD_URL}/en/discovery`,
          "Life Events",
      )

      const links = page.locator('a')

      const allLinks = await links.all()
      // Wait for all the getAttribute() calls to resolve.
      const allLinkHrefs = await Promise.all(
      // Extract the `href` attribute.
      allLinks.map((link) => link.getAttribute("href"))
      )

      const validHrefs = allLinkHrefs.reduce((links, link) => {
      // Evaluate link target but don't throw a failed assertion error.
      expect.soft(link).toBeTruthy()

      if (link && !link?.startsWith("mailto:") && !link?.startsWith("#") && !link?.startsWith("https://"))
        links.add(link)
      return links
    }, new Set<string>())

    // Iterate over the URLs and check the status code for en links.
    for (const url of validHrefs) {
      try {
        const response = await page.request.get(DASHBOARD_URL + url)
        expect
          .soft(response.ok(), `${url} has no green status code`)
          .toBeTruthy()
      } catch {
        expect.soft(null, `${url} has no green status code`).toBeTruthy()
      }
    }

    // Iterate over the URLs and check the status code for ga links.
    for (const url of validHrefs) {
      try {
        const response = await page.request.get(DASHBOARD_URL + url.replace("/en/", "/ga/"))
        expect
          .soft(response.ok(), `${url} has no green status code`)
          .toBeTruthy()
      } catch {
        expect.soft(null, `${url} has no green status code`).toBeTruthy()
      }
    }

  })  
})
