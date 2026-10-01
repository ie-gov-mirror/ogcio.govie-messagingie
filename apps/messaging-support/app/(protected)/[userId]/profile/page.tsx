import {
  Heading,
  Link,
  Paragraph,
  SectionBreak,
  Stack,
} from "@ogcio/design-system-react"
import { AnalyticsViewEventHandler } from "@/app/components/AnalyticsViewEventHandler"
import { ProfileMeta } from "@/app/components/ProfileMeta"
import { ProfileTables } from "@/app/(protected)/[userId]/profile/ProfileTables"
import AuthWrapper from "@/app/server-utils/AuthWrapper"
import { ANALYTICS } from "@/const/analytics"
import { ProfileDataService } from "@/data/profile"
import type { NextSearchParams } from "@/data/types"
import { getIdentity } from "@/utils/session"
import { getFullName, toURLSearchParams } from "@/utils/utils"
import { AlreadyDeletedAccountSection } from "./AlreadyDeleteAccountSection"
import { ConsentTables } from "./ConsentTables"
import { DataExportSection } from "./DataExportSection"
import { DeleteAccountSection } from "./DeleteAccountSection"
import { ConsentManagement } from "./ConsentManagement"
import "./overrides.css"

export default async function Profile(props: {
  params: Promise<{ userId: string }>
  searchParams: Promise<NextSearchParams>
}) {
  const sessionUser = await getIdentity()
  if (!sessionUser) {
    return null
  }

  const searchParams = await props.searchParams

  const { userId } = await props.params
  const profileResult = await ProfileDataService.getMainProfile(userId)
  if (!profileResult.success) {
    return null
  }

  const profile = profileResult.value
  const [consentsResult, consentData, exportTaskResult] = await Promise.all([
    ProfileDataService.getConsents(userId),
    ProfileDataService.getLatestConsentData(profile.primaryUserId),
    ProfileDataService.getExportTask(userId),
  ])

  if (!consentsResult.success) {
    return null
  }

  const consents = consentsResult.value
  const isProfileActive = profile.status === "active"
  const searchParamsString = toURLSearchParams(searchParams).toString()
  const exportTask = exportTaskResult.success ? exportTaskResult.value : null
  const exportLoadFailed = !exportTaskResult.success

  return (
    <AuthWrapper>
      <AnalyticsViewEventHandler
        event={{
          name: ANALYTICS.profile.view.name,
          category: ANALYTICS.profile.category,
          action: ANALYTICS.profile.view.action,
        }}
      >
        <Stack direction='column' gap={7}>
          <ProfileMeta
            place='Profile'
            searchParamsString={searchParamsString}
            fullName={getFullName(profile)}
          />
          <Stack direction={"row"} gap={20} style={{ flex: "1 1 320px" }}>
            <ProfileTables profile={profile} />
            <ConsentTables consents={consents} />
          </Stack>

          <SectionBreak size='md' />

          <ConsentManagement
            consentData={consentData}
            profileId={profile.primaryUserId}
          />

          <SectionBreak size='md' />

          <Stack direction='column' gap={3}>
            <Heading as='h4'>Data Export</Heading>
            <Paragraph size='sm'>
              Requests an export of the profile data, messages and shared files
              for this account. The citizen is not notified when support
              requests the export.
            </Paragraph>

            {isProfileActive && (
              <DataExportSection
                profile={profile}
                exportTask={exportTask}
                loadFailed={exportLoadFailed}
              />
            )}
          </Stack>

          <SectionBreak size='md' />

          <Stack direction='column' gap={3}>
            <Heading as='h4'>Delete Account</Heading>
            <Paragraph size='sm'>
              All account profile data and sessions will be deleted along with
              any links to organisations or data stored separately by PSBs.
            </Paragraph>

            {isProfileActive && <DeleteAccountSection profile={profile} />}

            {!isProfileActive && (
              <AlreadyDeletedAccountSection profile={profile} />
            )}
          </Stack>

          <Link href={`/?${searchParamsString}`} iconStart='arrow_back'>
            Back
          </Link>
        </Stack>
      </AnalyticsViewEventHandler>
    </AuthWrapper>
  )
}
