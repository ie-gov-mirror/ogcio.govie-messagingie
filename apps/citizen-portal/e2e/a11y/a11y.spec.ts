import AxeBuilder from "@axe-core/playwright"
import { createHtmlReport } from "axe-html-reporter"
import { type Browser, expect, test } from "@playwright/test"
import { urls, users } from "../fixtures"
import { MESSAGE_SUBJECT, ownMessageQuery } from "../helpers/message-sender"
import { createAuthenticatedPage } from "../helpers/user-auth.helper"
import fs from "fs"

const PROFILE_URL = urls.profileVisual
const DASHBOARD_URL = urls.dashboardVisual

type CitizenPage = {
  url: string
  citizen: string
  /** Query string the page needs, built when the test runs. */
  query?: (browser: Browser) => Promise<string>
  /** Heading the page shows once loaded, when `main` shows earlier. */
  heading?: string
}

const citizenPages: CitizenPage[] = [
  { url: "/en/messages", citizen: users.citizen1.email },
  {
    // The message is the test's own: no fixed message exists everywhere.
    url: "/en/secure-messages",
    citizen: users.peterParker.email,
    query: (browser) => ownMessageQuery(browser, users.peterParker),
    // The page shows a loading shell until it redirects to the message
    heading: MESSAGE_SUBJECT,
  },
]

test.describe("Accessibility (a11y) checks @regression", () => {
  for (const { url, citizen, query, heading } of citizenPages) {
    test(`citizen - should have no SERIOUS a11y violations on ${url}`, async ({
      browser,
    }) => {
      const search = (await query?.(browser)) ?? ""
      const page = await createAuthenticatedPage(browser, citizen)
      await page.goto(`${url}${search}`)
      await expect(page.locator("main")).toBeVisible()
      if (heading) {
        await expect(page.getByRole("heading", { name: heading })).toBeVisible()
      }
      const accessibilityScanResults = await new AxeBuilder({ page })
        .exclude('iframe[title="reCAPTCHA"]')
        .analyze()

      const pageName = url
        .replace(/\?.*$/, "")
        .replace(/\//g, "-")
        .replace(/-en-/g, "")

      const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: `accessibility-report-${pageName}.html`,
        },
      })

      if (!fs.existsSync(`./e2e/test-results/a11y-report/accessibility-report-${pageName}.html`)) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
        })
    } 
    fs.writeFileSync(`./e2e/test-results/a11y-report/accessibility-report-${pageName}.html`, reportHTML)

    const seriousViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      )
      expect(seriousViolations, `SERIOUS Violations on ${url}`).toEqual([])
      await page.close()
    })
  }
  
  test(`citizen - should have no SERIOUS a11y violations on consent`, async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(browser, users.bruceWayne.email)
    await page.goto("/en/messages?force-consent=1")
    await expect(page.getByRole("dialog")).toBeVisible()
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe[title="reCAPTCHA"]')
      .analyze()

    const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: "accessibility-report-consent.html",
      },
    })

    if (!fs.existsSync("./e2e/test-results/a11y-report/accessibility-report-consent.html")) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
      })
    }
    fs.writeFileSync("./e2e/test-results/a11y-report/accessibility-report-consent.html", reportHTML)

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    )
    expect(seriousViolations, `SERIOUS Violations on consent`).toEqual([])
    await page.close()
  })

  test(`citizen - should have no SERIOUS a11y violations on dashboard`, async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(
      browser,
      users.citizen1.email,
    )
    await page.goto(`${DASHBOARD_URL}/en/my-dashboard`)
    // `main` also exists on the auth pages this cross-zone hop redirects
    // through, so waiting on it lets Axe start injecting mid-redirect and the
    // navigation then destroys its execution context. Wait for content that
    // only the destination app renders.
    await expect(
      page.getByRole("heading", { name: "Welcome, E2E Citizen User" }),
    ).toBeVisible()
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe[title="reCAPTCHA"]')
      .analyze()

    const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: "accessibility-report-dashboard.html",
      },
    })

    if (!fs.existsSync("./e2e/test-results/a11y-report/accessibility-report-dashboard.html")) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
      })
    }
    fs.writeFileSync("./e2e/test-results/a11y-report/accessibility-report-dashboard.html", reportHTML)

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    )
    expect(seriousViolations, `SERIOUS Violations on dashboard`).toEqual([])
    await page.close()
  })

  test(`citizen - should have no SERIOUS a11y violations on submissions`, async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(
      browser,
      users.peterParker.email,
    )
    await page.goto(`${DASHBOARD_URL}/en/my-submissions`)
    await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible()
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe[title="reCAPTCHA"]')
      .analyze()

    const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: "accessibility-report-submissions.html",
      },
    })

    if (!fs.existsSync("./e2e/test-results/a11y-report/accessibility-report-submissions.html")) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
      })
    }
    fs.writeFileSync("./e2e/test-results/a11y-report/accessibility-report-submissions.html", reportHTML)

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    )
    expect(seriousViolations, `SERIOUS Violations on submissions`).toEqual([])
    await page.close()
  })

  test(`citizen - should have no SERIOUS a11y violations on life events discovery`, async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(
      browser,
      users.citizen1.email,
    )
    await page.goto(`${DASHBOARD_URL}/en/discovery`)
    await expect(
      page.getByRole("heading", { name: "Life Events" }),
    ).toBeVisible()
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe[title="reCAPTCHA"]')
      .analyze()

    const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: "accessibility-report-discovery.html",
      },
    })

    if (!fs.existsSync("./e2e/test-results/a11y-report/accessibility-report-discovery.html")) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
      })
    }
    fs.writeFileSync("./e2e/test-results/a11y-report/accessibility-report-discovery.html", reportHTML)

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    )
    expect(seriousViolations, `SERIOUS Violations on discovery`).toEqual([])
    await page.close()
  })

  test(`citizen - should have no SERIOUS a11y violations on life events example`, async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(
      browser,
      users.citizen1.email,
    )
    await page.goto(`${DASHBOARD_URL}/en/discovery/child-starting-school`)
    await expect(
      page.getByRole("heading", { name: "Child Starting School" }),
    ).toBeVisible()
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe[title="reCAPTCHA"]')
      .analyze()

    const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: "accessibility-report-discovery/child-starting-school.html",
      },
    })

    if (!fs.existsSync("./e2e/test-results/a11y-report/accessibility-report-discovery.html")) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
      })
    }
    fs.writeFileSync("./e2e/test-results/a11y-report/accessibility-report-discovery.html", reportHTML)

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    )
    expect(seriousViolations, `SERIOUS Violations on discovery`).toEqual([])
    await page.close()
  })

  test(`citizen - should have no SERIOUS a11y violations on profile`, async ({
    browser,
  }) => {
    const page = await createAuthenticatedPage(
      browser,
      users.citizen1.email,
    )
    await page.goto(`${PROFILE_URL}/en`)
    await expect(
      page.getByRole("heading", { name: "My Profile" }),
    ).toBeVisible()
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('iframe[title="reCAPTCHA"]')
      .analyze()
    
    const reportHTML = createHtmlReport({
      results: accessibilityScanResults,
      options: {
        projectKey: "citizen-portal",
        outputDir: "./e2e/test-results/a11y-report",
        reportFileName: "accessibility-report-profile.html",
      },
    })

    if (!fs.existsSync("./e2e/test-results/a11y-report/accessibility-report-profile.html")) {
      fs.mkdirSync("./e2e/test-results/a11y-report", {
        recursive: true,
      })
    }
    fs.writeFileSync("./e2e/test-results/a11y-report/accessibility-report-profile.html", reportHTML)
    
    const seriousViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    )
    expect(seriousViolations, `SERIOUS Violations on profile`).toEqual([])
    await page.close()
  })
})
