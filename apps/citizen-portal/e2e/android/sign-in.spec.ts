import { expect } from "@playwright/test"
import { users } from "../fixtures"
import { loginAsCitizen } from "../helpers/user-auth.helper"
import { test } from "./fixtures"

test("a citizen can sign in on Android Chrome @smoke @mobile", async ({
  page,
}) => {
  expect(await page.evaluate(() => navigator.userAgent)).toContain("Android")

  // The portal sends a signed-out citizen through Logto to the MyGovID mock
  await loginAsCitizen(page, users.citizen1.email)

  // Signed in: the inbox shows, with or without messages
  await page.waitForURL("**/en/messages")
  await expect(
    page.getByTestId("search-input").or(page.getByTestId("messages-empty")),
  ).toBeVisible()
})
