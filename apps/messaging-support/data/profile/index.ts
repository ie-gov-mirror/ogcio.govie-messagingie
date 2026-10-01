import { withSpan } from "@ogcio/o11y-sdk-node"
import { getEnvConfig } from "@/utils/env"
import { AppHttp } from "../http"
import { logger } from "../logger"
import { getSupportSdk } from "../sdk"
import {
  type Consent,
  type ExportTask,
  type FullProfile,
  type GetUserConsentDataResponse,
  type LinkProfile,
  type LogtoUser,
  type LogtoUserRole,
  type MainProfile,
  type NextSearchParams,
  type ProfileLinkParams,
  type ProfileQueryBase,
  type Result,
  type UpdateUserConsentDataResponse,
  UserRelationStatuses,
  type UserRelations,
} from "../types"
import {
  failure,
  GENERIC_USER_ERROR,
  serializeErrorForLog,
  success,
} from "../utils"
import {
  fetchLogtoUserRole,
  fetchLogtoUsers,
  fetchM2MmanagementAccessToken,
  fetchPatchLinkedAccount,
} from "./http"
import { buildListUserSdkBody } from "./logic"
import {
  queryAssociatedProfileIds,
  queryConsentsForProfile,
  queryProfile,
  queryProfileLinkDetails,
  queryRelatedUsersByUserId,
} from "./pgAccess"

const profileSdk = getSupportSdk(getEnvConfig()).profile
const supportSdk = profileSdk.support

async function getUserRelationStatus(
  toSearchForUserId: string,
): Promise<Result<UserRelations>> {
  return withSpan({
    spanName: "ProfileDataService.getUserRelationStatus",
    fn: async (span) => {
      const queryResult = await queryRelatedUsersByUserId(toSearchForUserId)

      if (!queryResult.success) {
        span.recordException(queryResult.error)
        return queryResult
      }

      let parent: ProfileQueryBase | undefined
      const foundUser: ProfileQueryBase | undefined = queryResult.value.find(
        (user) => user.id === toSearchForUserId,
      )
      if (!foundUser) {
        const error = new Error(
          `[getUserRelationStatus] could not find user with id ${toSearchForUserId}`,
        )
        span.recordException(error)
        return failure(error, GENERIC_USER_ERROR)
      }
      const childs: ProfileQueryBase[] = []

      for (const currentUser of queryResult.value) {
        const { id, primary_user_id } = currentUser
        if (id === toSearchForUserId) {
          continue
        }

        if (primary_user_id === toSearchForUserId) {
          childs.push({ ...currentUser })
          continue
        }

        if (id === foundUser.primary_user_id) {
          parent = { ...currentUser }
        }
      }

      if (!parent && !childs.length) {
        return success({
          userIs: UserRelationStatuses.Unlinked,
          userData: foundUser,
        })
      }
      if (parent) {
        return success({
          userIs: UserRelationStatuses.Child,
          parent,
          userData: foundUser,
        })
      }
      return success({
        userIs: UserRelationStatuses.Parent,
        children: childs,
        userData: foundUser,
      })
    },
  })
}

async function getAccountLinkDetails(
  params: ProfileLinkParams,
): Promise<Result<LinkProfile>> {
  return withSpan({
    spanName: "ProfileDataService.getAccountLinkDetails",
    fn: async (span) => {
      const profileResult = await queryProfileLinkDetails(params)

      if (!profileResult.success) {
        span.recordException(profileResult.error)
        return profileResult
      }

      const { email, id, public_name, primary_user_id, links } =
        profileResult.value
      const linkProfile: LinkProfile = {
        id,
        email,
        name: public_name,
        isPrimary: primary_user_id === id,
        links: links
          .filter((x) => x.id !== id)
          .map((x) => ({
            id: x.id,
            email: x.email,
            name: x.public_name,
            isPrimary: x.is_primary,
          })),
      }

      return success(linkProfile)
    },
  })
}

async function createAccountLink(params: {
  profileId: string
  primaryUserId: string | null
}) {
  return withSpan({
    spanName: "ProfileDataService.createAccountLink",
    fn: async (span) => {
      const { primaryUserId, profileId } = params

      const tokenResult = await AppHttp.fetchAppM2MToken()
      if (!tokenResult.success) {
        span.recordException(tokenResult.error)
        return tokenResult
      }

      const token = tokenResult.value

      const linkAccountResult = await fetchPatchLinkedAccount({
        bearerToken: token,
        primaryUserId,
        profileId,
      })

      if (!linkAccountResult.success) {
        span.recordException(linkAccountResult.error)
        return linkAccountResult
      }

      return linkAccountResult
    },
  })
}

async function getProfiles(
  nextSearchParams: NextSearchParams,
): Promise<Result<FullProfile[]>> {
  return withSpan({
    spanName: "ProfileDataService.getProfiles",
    fn: async (span) => {
      const body = buildListUserSdkBody(nextSearchParams)
      if (!body.success) {
        logger.error(body.error)
        span.recordException(body.error)
        return body
      }
      const result = await supportSdk.postProfileSearch(body.value)
      if (result.error || !result.data) {
        logger.error(result.error)
        span.recordException(result.error)
        return failure(result.error, GENERIC_USER_ERROR)
      }

      const managementTokenResult = await fetchM2MmanagementAccessToken()
      if (!managementTokenResult.success) {
        logger.error(managementTokenResult.error)
        span.recordException(managementTokenResult.error)
        return managementTokenResult
      }

      const profileIds = result.data.map((profile) => profile.id)
      const logtoUsersResult = await fetchLogtoUsers(
        profileIds,
        managementTokenResult.value,
      )
      const logtoUsers: LogtoUser[] = []
      // It's not fatal if this fails
      if (!logtoUsersResult.success) {
        logger.error(logtoUsersResult.error)
        span.recordException(logtoUsersResult.error)
      } else {
        logtoUsers.push(...logtoUsersResult.value)
      }

      const logoUserRolesResult = await fetchLogtoUserRole(
        profileIds,
        managementTokenResult.value,
      )
      const logtoUserRoles: LogtoUserRole[][] = []

      // It's not fatal if this fails
      if (!logoUserRolesResult.success) {
        logger.error(logoUserRolesResult.error)
        span.recordException(logoUserRolesResult.error)
      } else {
        logtoUserRoles.push(...logoUserRolesResult.value)
      }

      const fullProfiles: FullProfile[] = result.data.map((profile, i) => ({
        id: profile.id,
        public_name: profile.publicName,
        email: profile.email,
        primary_user_id: profile.primaryUserId,
        organisation_id: profile.organisationId,
        safe_level: profile.safeLevel,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt,
        deleted_at: profile.deletedAt,
        logtoUser: logtoUsers.find((user) => user.id === profile.id),
        logtoUserRoles: logtoUserRoles.at(i) ?? [],
        data: {
          publicName: profile.publicName,
          ppsn: profile.ppsn ?? undefined,
          dateOfBirth: profile.dateOfBirth ?? undefined,
          email: profile.email ?? undefined,
          firstName: profile.firstName ?? undefined,
          lastName: profile.lastName ?? undefined,
        },
        status: profile.status,
        preferred_language: profile.preferredLanguage,
        consent_statuses: profile.consentStatuses,
      }))

      return success(fullProfiles)
    },
  })
}

async function getMainProfile(profileId: string): Promise<Result<MainProfile>> {
  return withSpan({
    spanName: "ProfileDataService.getMainProfile",
    fn: async (span) => {
      const profileDataResult = await queryProfile(profileId)
      if (!profileDataResult.success) {
        span.recordException(profileDataResult.error)
        return profileDataResult
      }

      const profile =
        profileDataResult.value.find(
          (profile) =>
            !profile.organisation_id && profile.id === profile.primary_user_id,
        ) ?? profileDataResult.value.at(0)

      if (!profile) {
        const error = new Error(
          `[getMainProfile] no profile found for ${profileId}`,
        )
        span.recordException(error)
        return failure(error, GENERIC_USER_ERROR)
      }

      const mainProfile: MainProfile = {
        firstName: profile.data.firstName,
        lastName: profile.data.lastName,
        id: profile.id,
        primaryUserId: profile.primary_user_id,
        email: profile.email,
        ppsn: profile.data.ppsn,
        publicName: profile.public_name,
        status: profile.status,
      }

      return success(mainProfile)
    },
  })
}

async function getAssociatedProfileIds(
  profileId: string,
): Promise<Result<string[]>> {
  return withSpan({
    spanName: "ProfileDataService.getAssociatedProfileIds",
    fn: async (span) => {
      const associatedQueryResult = await queryAssociatedProfileIds(profileId)
      if (!associatedQueryResult.success) {
        span.recordException(associatedQueryResult.error)
      }
      return associatedQueryResult
    },
  })
}

async function getConsents(profileId: string) {
  return withSpan({
    spanName: "ProfileDataService.getConsents",
    fn: async (span) => {
      const queryRestult = await queryConsentsForProfile(profileId)
      if (!queryRestult.success) {
        span.recordException(queryRestult.error)
      }

      return queryRestult
    },
  })
}

async function deleteAccount(params: {
  profileId: string
  requesterUserId: string
}): Promise<Result<void>> {
  return withSpan({
    spanName: "ProfileDataService.deleteAccount",
    fn: async (span) => {
      const result = await profileSdk.createDeleteProfileLifecycleTask(params)

      if (result.error) {
        logger.error(
          { error: serializeErrorForLog(result.error) },
          "Failed to create delete_profile lifecycle task",
        )
        span.recordException(result.error)
        return failure(result.error, GENERIC_USER_ERROR)
      }

      return success(undefined)
    },
  })
}

async function requestDataExport(params: {
  profileId: string
  requesterUserId: string
}): Promise<Result<void>> {
  return withSpan({
    spanName: "ProfileDataService.requestDataExport",
    fn: async (span) => {
      const result = await profileSdk.createExportUserDataLifecycleTask(params)

      if (result.error) {
        logger.error(
          { error: serializeErrorForLog(result.error) },
          "Failed to create export_user_data lifecycle task",
        )
        span.recordException(result.error)
        return failure(result.error, GENERIC_USER_ERROR)
      }

      return success(undefined)
    },
  })
}

async function getExportTask(
  profileId: string,
): Promise<Result<ExportTask | null>> {
  return withSpan({
    spanName: "ProfileDataService.getExportTask",
    fn: async (span) => {
      const result = await profileSdk.getLifecycleTasks({
        profileId,
        taskType: "export_user_data",
      })

      if (result.error || !result.data) {
        logger.error(
          { error: serializeErrorForLog(result.error) },
          "Failed to search lifecycle tasks",
        )
        span.recordException(result.error)
        return failure(result.error, GENERIC_USER_ERROR)
      }

      const task = result.data.tasks.at(0)

      if (!task) {
        return success(null)
      }

      return success({
        id: task.id,
        status: task.status,
        metadata: task.metadata ?? null,
      })
    },
  })
}

async function getLatestConsentData(
  profileId: string,
): Promise<GetUserConsentDataResponse> {
  return withSpan({
    spanName: "ProfileDataService.getLatestConsents",
    fn: async (span) => {
      const result = await supportSdk.getLatestConsents({ profileId })

      if (result.error) {
        logger.error(
          { error: serializeErrorForLog(result.error) },
          "Failed to fetch latest consents",
        )
        span.recordException(result.error)
        return failure(result.error, GENERIC_USER_ERROR)
      }

      return success(result.data)
    },
  })
}

async function updateProfileConsentData(params: {
  consents: { subject: string; status: Consent["status"] }[]
  profileId: string
}): Promise<UpdateUserConsentDataResponse> {
  return withSpan({
    spanName: "ProfileDataService.submitConsents",
    fn: async (span) => {
      const { consents, profileId } = params

      const result = await supportSdk.submitConsents({ consents, profileId })

      if (result.error) {
        logger.error(
          { error: serializeErrorForLog(result.error) },
          "Failed to submit consents",
        )
        span.recordException(result.error)
        return failure(result.error, GENERIC_USER_ERROR)
      }

      return success(result.data)
    },
  })
}

export const ProfileDataService = {
  getAccountLinkDetails,
  createAccountLink,
  getMainProfile,
  getAssociatedProfileIds,
  getConsents,
  deleteAccount,
  requestDataExport,
  getExportTask,
  getUserRelationStatus,
  getLatestConsentData,
  updateProfileConsentData,
  getProfilesSdk: getProfiles,
} as const
