"use server"

import { emitAuditOnce } from "@/data/audit"
import { ProfileDataService } from "@/data/profile"
import type { Consent, Failure } from "@/data/types"
import { failure, PROFILE_NOT_FOUND_FOR_ID } from "@/data/utils"
import {
  serverMessagingFilterKeySelectOptions,
  serverProfileFilterKeySelectOptions,
} from "./appliedFilter.server"
import type { ClientFilterKeyOption } from "./appliedFilter.types"
import { getIdentity } from "./session"

function rejectUnresolvedProfile(error: Error): Failure {
  return { success: false, error, userMessage: PROFILE_NOT_FOUND_FOR_ID }
}

export async function getMessagingFilterOptions(): Promise<
  ClientFilterKeyOption[]
> {
  return serverMessagingFilterKeySelectOptions.map((option) => ({
    value: option.value,
    type: option.type,
    label: option.label,
  }))
}

export async function getProfileFilterOptions(): Promise<
  ClientFilterKeyOption[]
> {
  return serverProfileFilterKeySelectOptions.map((option) => ({
    value: option.value,
    type: option.type,
    label: option.label,
  }))
}

export async function linkAccountsAction(params: {
  profileId: string
  primaryUserId: string | null
}) {
  const user = await getIdentity()
  if (!user) {
    return failure(new Error("no user"), "unauthorized")
  }

  const profile = await ProfileDataService.getMainProfile(params.profileId)
  if (!profile.success) {
    return rejectUnresolvedProfile(profile.error)
  }

  const result = await ProfileDataService.createAccountLink({
    ...params,
    profileId: profile.value.id,
  })
  void emitAuditOnce(
    {
      actionName: "createAccountLink",
      actionType: "create",
      user,
      args: params,
    },
    result.success ? undefined : result.error.message,
  )
  return result
}

export async function getAccountLinkDetailsAction(
  params: Parameters<typeof ProfileDataService.getAccountLinkDetails>[number],
) {
  const user = await getIdentity()
  if (!user) {
    return failure(new Error("no user"), "unauthorized")
  }

  const detailsResult = await ProfileDataService.getAccountLinkDetails(params)

  void emitAuditOnce(
    {
      actionName: "getAccountLinkDetails",
      actionType: "list",
      user,
      args: params,
    },
    detailsResult.success ? undefined : detailsResult.error.message,
  ).catch(console.error)
  return detailsResult
}

export async function updateProfileConsentDataAction(params: {
  profileId: string
  consents: { subject: string; status: Consent["status"] }[]
}) {
  const user = await getIdentity()
  if (!user) {
    return failure(new Error("no user"), "unauthorized")
  }

  const profile = await ProfileDataService.getMainProfile(params.profileId)
  if (!profile.success) {
    return rejectUnresolvedProfile(profile.error)
  }

  const result = await ProfileDataService.updateProfileConsentData({
    ...params,
    profileId: profile.value.id,
  })
  void emitAuditOnce(
    {
      actionName: "updateProfileConsentData",
      actionType: "update",
      user,
      args: params,
    },
    result.success ? undefined : result.error.message,
  )
  return result
}

export async function deleteAccountAction(params: { profileId: string }) {
  const user = await getIdentity()
  if (!user) {
    return failure(new Error("no user"), "unauthorized")
  }

  const profile = await ProfileDataService.getMainProfile(params.profileId)
  if (!profile.success) {
    return rejectUnresolvedProfile(profile.error)
  }

  const result = await ProfileDataService.deleteAccount({
    profileId: profile.value.id,
    requesterUserId: user.sub,
  })
  void emitAuditOnce(
    {
      actionName: "deleteAccount",
      actionType: "delete",
      user,
      args: params,
    },
    result.success ? undefined : result.error.message,
  )
  return result
}

export async function requestDataExportAction(params: { profileId: string }) {
  const user = await getIdentity()
  if (!user) {
    return failure(new Error("no user"), "unauthorized")
  }

  const profile = await ProfileDataService.getMainProfile(params.profileId)
  if (!profile.success) {
    return rejectUnresolvedProfile(profile.error)
  }

  const result = await ProfileDataService.requestDataExport({
    profileId: profile.value.id,
    requesterUserId: user.sub,
  })
  void emitAuditOnce(
    {
      actionName: "requestDataExport",
      actionType: "create",
      user,
      args: params,
    },
    result.success ? undefined : result.error.message,
  )
  return result
}
