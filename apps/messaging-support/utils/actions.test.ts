import { beforeEach, describe, expect, it, vi } from "vitest"
import { emitAuditOnce } from "@/data/audit"
import { ProfileDataService } from "@/data/profile"
import { GENERIC_USER_ERROR, PROFILE_NOT_FOUND_FOR_ID } from "@/data/utils"
import { getIdentity } from "./session"

vi.mock("@/data/profile", () => ({
  ProfileDataService: {
    getMainProfile: vi.fn(),
    requestDataExport: vi.fn(),
    createAccountLink: vi.fn(),
    getAccountLinkDetails: vi.fn(),
    updateProfileConsentData: vi.fn(),
    deleteAccount: vi.fn(),
  },
}))

vi.mock("@/data/audit", () => ({
  emitAuditOnce: vi.fn(async () => undefined),
}))

vi.mock("./session", () => ({
  getIdentity: vi.fn(),
}))

vi.mock("./appliedFilter.server", () => ({
  serverMessagingFilterKeySelectOptions: [
    {
      value: "scheduled_at",
      type: "date",
      label: "Scheduled",
      source: { type: "column", column: "scheduled_at" },
    },
  ],
  serverProfileFilterKeySelectOptions: [
    {
      value: "email",
      type: "text",
      label: "Email",
      source: { type: "column", column: "email" },
    },
  ],
}))

const {
  deleteAccountAction,
  getAccountLinkDetailsAction,
  getMessagingFilterOptions,
  getProfileFilterOptions,
  linkAccountsAction,
  requestDataExportAction,
  updateProfileConsentDataAction,
} = await import("./actions")

const signedInUser = {
  sub: "agent-1",
} as Awaited<ReturnType<typeof getIdentity>>

describe("requestDataExportAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: true,
      value: {
        id: "profile-1",
        primaryUserId: "profile-1",
        status: "active",
      },
    })
  })

  it("returns unauthorized and calls nothing when there is no session user", async () => {
    vi.mocked(getIdentity).mockResolvedValue(null)

    const result = await requestDataExportAction({ profileId: "profile-1" })

    expect(result.success).toBe(false)
    expect(ProfileDataService.requestDataExport).not.toHaveBeenCalled()
    expect(emitAuditOnce).not.toHaveBeenCalled()
  })

  it("rejects an unknown profile before creating an export task", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: false,
      error: new Error("profile not found"),
      userMessage: "profile not found",
    })

    const result = await requestDataExportAction({
      profileId: "nonexistent-15457-a",
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.requestDataExport).not.toHaveBeenCalled()
  })

  it("rejects an unresolved profile with a stable not-found message", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: false,
      error: new Error("[getMainProfile] no profile found for p-1"),
      userMessage: GENERIC_USER_ERROR,
    })

    const result = await requestDataExportAction({ profileId: "p-1" })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.userMessage).toBe(PROFILE_NOT_FOUND_FOR_ID)
    }
    expect(ProfileDataService.requestDataExport).not.toHaveBeenCalled()
  })

  it("passes the signed-in agent as the requester and audits the success", async () => {
    const user = {
      sub: "agent-1",
    } as Awaited<ReturnType<typeof getIdentity>>
    vi.mocked(getIdentity).mockResolvedValue(user)
    vi.mocked(ProfileDataService.requestDataExport).mockResolvedValue({
      success: true,
      value: undefined,
    })

    const result = await requestDataExportAction({ profileId: "profile-1" })

    expect(result.success).toBe(true)
    expect(ProfileDataService.requestDataExport).toHaveBeenCalledWith({
      profileId: "profile-1",
      requesterUserId: "agent-1",
    })
    expect(emitAuditOnce).toHaveBeenCalledWith(
      {
        actionName: "requestDataExport",
        actionType: "create",
        user,
        args: { profileId: "profile-1" },
      },
      undefined,
    )
  })

  it("threads the failure reason into the audit log when the data layer fails", async () => {
    const user = {
      sub: "agent-1",
    } as Awaited<ReturnType<typeof getIdentity>>
    vi.mocked(getIdentity).mockResolvedValue(user)
    vi.mocked(ProfileDataService.requestDataExport).mockResolvedValue({
      success: false,
      error: new Error("export already in progress"),
      userMessage: "export already in progress",
    })

    const result = await requestDataExportAction({ profileId: "profile-1" })

    expect(result.success).toBe(false)
    expect(emitAuditOnce).toHaveBeenCalledWith(
      {
        actionName: "requestDataExport",
        actionType: "create",
        user,
        args: { profileId: "profile-1" },
      },
      "export already in progress",
    )
  })
})

describe("filter option actions", () => {
  it("maps messaging filter options to client shape (no source)", async () => {
    const options = await getMessagingFilterOptions()
    expect(options).toEqual([
      { value: "scheduled_at", type: "date", label: "Scheduled" },
    ])
  })

  it("maps profile filter options to client shape (no source)", async () => {
    const options = await getProfileFilterOptions()
    expect(options).toEqual([{ value: "email", type: "text", label: "Email" }])
  })
})

describe("linkAccountsAction", () => {
  it("returns unauthorized without a session user", async () => {
    vi.mocked(getIdentity).mockResolvedValue(null)

    const result = await linkAccountsAction({
      profileId: "p-1",
      primaryUserId: "u-1",
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.createAccountLink).not.toHaveBeenCalled()
  })

  it("rejects an unknown profile before linking accounts", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: false,
      error: new Error("profile not found"),
      userMessage: "profile not found",
    })

    const result = await linkAccountsAction({
      profileId: "../../profiles/p-1",
      primaryUserId: "u-1",
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.createAccountLink).not.toHaveBeenCalled()
  })

  it("links the accounts and audits the outcome", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: true,
      value: {
        id: "p-1",
        primaryUserId: "p-1",
        status: "active",
      },
    })
    vi.mocked(ProfileDataService.createAccountLink).mockResolvedValue({
      success: true,
      value: undefined,
    })

    const params = { profileId: "p-1", primaryUserId: "u-1" }
    const result = await linkAccountsAction(params)

    expect(result.success).toBe(true)
    expect(ProfileDataService.createAccountLink).toHaveBeenCalledWith(params)
    expect(emitAuditOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "createAccountLink",
        actionType: "create",
      }),
      undefined,
    )
  })
})

describe("getAccountLinkDetailsAction", () => {
  it("returns unauthorized without a session user", async () => {
    vi.mocked(getIdentity).mockResolvedValue(null)

    const result = await getAccountLinkDetailsAction({
      type: "id",
      value: "p-1",
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.getAccountLinkDetails).not.toHaveBeenCalled()
  })

  it("returns the details and audits with the failure reason on error", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getAccountLinkDetails).mockResolvedValue({
      success: false,
      error: new Error("not found"),
      userMessage: "not found",
    })

    const result = await getAccountLinkDetailsAction({
      type: "email",
      value: "a@b.ie",
    })

    expect(result.success).toBe(false)
    expect(emitAuditOnce).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "getAccountLinkDetails" }),
      "not found",
    )
  })
})

describe("updateProfileConsentDataAction", () => {
  it("returns unauthorized without a session user", async () => {
    vi.mocked(getIdentity).mockResolvedValue(null)

    const result = await updateProfileConsentDataAction({
      profileId: "p-1",
      consents: [],
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.updateProfileConsentData).not.toHaveBeenCalled()
  })

  it("rejects an unknown profile before updating consents", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: false,
      error: new Error("profile not found"),
      userMessage: "profile not found",
    })

    const result = await updateProfileConsentDataAction({
      profileId: "../../profiles/p-1",
      consents: [],
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.updateProfileConsentData).not.toHaveBeenCalled()
  })

  it("updates the consents and audits the outcome", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: true,
      value: {
        id: "p-1",
        primaryUserId: "p-1",
        status: "active",
      },
    })
    vi.mocked(ProfileDataService.updateProfileConsentData).mockResolvedValue({
      success: true,
      value: [],
    })

    const params = {
      profileId: "p-1",
      consents: [{ subject: "marketing", status: "opted-in" as const }],
    }
    const result = await updateProfileConsentDataAction(params)

    expect(result.success).toBe(true)
    expect(ProfileDataService.updateProfileConsentData).toHaveBeenCalledWith(
      params,
    )
    expect(emitAuditOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "updateProfileConsentData",
        actionType: "update",
      }),
      undefined,
    )
  })
})

describe("deleteAccountAction", () => {
  it("returns unauthorized without a session user", async () => {
    vi.mocked(getIdentity).mockResolvedValue(null)

    const result = await deleteAccountAction({ profileId: "p-1" })

    expect(result.success).toBe(false)
    expect(ProfileDataService.deleteAccount).not.toHaveBeenCalled()
  })

  it("rejects an unknown profile before creating a delete task", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: false,
      error: new Error("profile not found"),
      userMessage: "profile not found",
    })

    const result = await deleteAccountAction({
      profileId: "../../profiles/profile-1",
    })

    expect(result.success).toBe(false)
    expect(ProfileDataService.deleteAccount).not.toHaveBeenCalled()
  })

  it("passes the signed-in agent as the requester and audits", async () => {
    vi.mocked(getIdentity).mockResolvedValue(signedInUser)
    vi.mocked(ProfileDataService.getMainProfile).mockResolvedValue({
      success: true,
      value: {
        id: "p-1",
        primaryUserId: "p-1",
        status: "active",
      },
    })
    vi.mocked(ProfileDataService.deleteAccount).mockResolvedValue({
      success: true,
      value: undefined,
    })

    const result = await deleteAccountAction({ profileId: "p-1" })

    expect(result.success).toBe(true)
    expect(ProfileDataService.deleteAccount).toHaveBeenCalledWith({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })
    expect(emitAuditOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "deleteAccount",
        actionType: "delete",
      }),
      undefined,
    )
  })
})
