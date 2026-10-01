import type { Page } from "@playwright/test"
import { test } from "@playwright/test"
import { urls } from "../fixtures"
import { authenticateUser } from "../helpers/auth"
import { runLighthouseAudit } from "../helpers/lighthouse.helper"

const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:4002"
// PROFILE_ADMIN_URL is not set by the regression pipeline, so reading it here
// silently fell back to localhost and every cross-app audit hit
// ERR_CONNECTION_REFUSED. Use the same fixture the other specs go through.
const PROFILE_ADMIN_URL = urls.profileAdminRoot

type AuditCase = {
  title: string
  auditUrl: string
  reportName: string
  prepare?: (page: Page) => Promise<void>
}

const adminPathCases: AuditCase[] = [
  "/en/send-a-message",
  "/en/message-templates",
  "/en/message-templates/template",
  "/en/providers",
  "/en/providers/email",
  "/en/message-events",
  "/en/message-events/detail?eventId=4f765021-4760-4d1c-8f3e-c620c5cc407e",
].map((path) => ({
  title: path,
  auditUrl: `${ADMIN_URL}${path}`,
  reportName: `lighthouse${path.replace(/\//g, "-").split("?")[0]}`,
}))

const crossAppCases: AuditCase[] = [
  {
    title: "profile admin",
    auditUrl: `${PROFILE_ADMIN_URL}/en/my-profile`,
    reportName: "lighthouse-profile-admin",
    prepare: async (page) => {
      await page.goto(`${PROFILE_ADMIN_URL}/en/my-profile`)
    },
  },
  {
    title: "service users",
    auditUrl: `${PROFILE_ADMIN_URL}/en/service-users`,
    reportName: "lighthouse-service-users",
    prepare: async (page) => {
      await page.goto(`${PROFILE_ADMIN_URL}/en/service-users`)
    },
  },
]

test.describe("Lighthouse Audit @regression", () => {
  for (const auditCase of [...adminPathCases, ...crossAppCases]) {
    test(`admin - audit ${auditCase.title}`, async () => {
      await runLighthouseAudit({
        auditUrl: auditCase.auditUrl,
        reportName: auditCase.reportName,
        authenticate: async (page) => {
          await authenticateUser(page)
          await auditCase.prepare?.(page)
        },
      })
    })
  }
})
