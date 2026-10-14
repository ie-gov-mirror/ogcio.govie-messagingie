import {
  Heading,
  Link,
  Stack,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@ogcio/design-system-react"
import { Suspense } from "react"
import { ProfileMeta } from "@/app/components/ProfileMeta"
import AuthWrapper from "@/app/server-utils/AuthWrapper"
import { ProfileDataService } from "@/data/profile"
import { getMessagingFilterOptions } from "@/utils/actions"
import { getFullName, toURLSearchParams } from "@/utils/utils"
import { TableBodyRows } from "./components/TableBodyRows"
import Filter from "./Filter"

export default async function Messages(props: {
  params: Promise<{ userId: string }>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const { userId } = await props.params
  const searchParams = await props.searchParams
  const profileResult = await ProfileDataService.getMainProfile(userId)

  if (!profileResult.success) {
    return null
  }

  const profile = profileResult.value

  const messagingFilterKeySelectOptions = await getMessagingFilterOptions()

  const searchParamsString = toURLSearchParams(searchParams).toString()
  return (
    <AuthWrapper>
      <Suspense>
        <Stack direction='column' gap={7}>
          <ProfileMeta
            place='Messaging'
            searchParamsString={searchParamsString}
            fullName={getFullName(profile)}
          />
          <Filter keyOptions={messagingFilterKeySelectOptions} />

          <Stack direction='column' gap={3}>
            <Heading as='h4'>Messaging</Heading>

            <Table>
              <TableHead
                style={{
                  backgroundColor:
                    "var(--gieds-color-surface-system-neutral-layer1)",
                }}
              >
                <TableRow>
                  <TableHeader>Scheduled for delivery</TableHeader>
                  <TableHeader>MessagingIE Status</TableHeader>
                  <TableHeader>Email Notification Status</TableHeader>
                  <TableHeader>Org</TableHeader>
                  <TableHeader>Subject</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableBodyRows profileId={userId} searchParams={searchParams} />
              </TableBody>
            </Table>
          </Stack>
          <Link href={`/?${searchParamsString}`} iconStart='arrow_back'>
            Back
          </Link>
        </Stack>
      </Suspense>
    </AuthWrapper>
  )
}
