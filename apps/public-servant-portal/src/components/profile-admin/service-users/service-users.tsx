"use client"

import {
  Heading,
  Stack,
  TabItem,
  TabList,
  TabPanel,
  Tabs,
} from "@ogcio/design-system-react"
import { useAnalytics } from "@ogcio/nextjs-analytics"
import { useTranslations } from "next-intl"
import { Suspense } from "react"
import { FullWidthContainer } from "@/components/profile-admin/layout/containers"
import { ANALYTICS } from "@/const/analytics"
import { ServiceUsersImportCSV } from "./service-users-import-csv"
import { ServiceUsersImportsTable } from "./service-users-imports-table"
import { ServiceUsersTable } from "./service-users-table"

export function ServiceUsers() {
  const t = useTranslations("serviceUsers")
  const analyticsClient = useAnalytics()

  return (
    <Stack direction='column' gap={10}>
      <Heading>{t("title")}</Heading>
      <FullWidthContainer>
        <Tabs ariaLabelledBy='tab-story' id='tab-story'>
          <TabList>
            <TabItem value='1'>{t("tabs.users")}</TabItem>
            <TabItem
              value='2'
              onTabClick={() => {
                analyticsClient.trackEvent({
                  event: {
                    name: ANALYTICS.recipient.viewUploadLogs.name,
                    category: ANALYTICS.recipient.category,
                    action: ANALYTICS.recipient.viewUploadLogs.action,
                  },
                })
              }}
            >
              {t("tabs.imports")}
            </TabItem>
            <TabItem value='3'>{t("tabs.importCsv")}</TabItem>
          </TabList>
          <TabPanel value='1'>
            <Suspense>
              <ServiceUsersTable />
            </Suspense>
          </TabPanel>
          <TabPanel value='2'>
            <Suspense>
              <ServiceUsersImportsTable />
            </Suspense>
          </TabPanel>
          <TabPanel value='3'>
            <ServiceUsersImportCSV />
          </TabPanel>
        </Tabs>
      </FullWidthContainer>
    </Stack>
  )
}
