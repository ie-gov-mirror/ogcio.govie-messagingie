import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProfileQueryBase, ProfileQueryRow } from "../types"

vi.mock("@ogcio/o11y-sdk-node", () => ({
  withSpan: ({ fn }: { fn: (span: unknown) => unknown }) =>
    fn({ recordException: vi.fn(), setAttribute: vi.fn() }),
}))

vi.mock("./pgAccess", () => ({
  queryRelatedUsersByUserId: vi.fn(),
  queryProfileLinkDetails: vi.fn(),
  queryProfile: vi.fn(),
  queryAssociatedProfileIds: vi.fn(),
  queryConsentsForProfile: vi.fn(),
}))

vi.mock("./http", () => ({
  fetchLogtoUserRole: vi.fn(),
  fetchLogtoUsers: vi.fn(),
  fetchM2MmanagementAccessToken: vi.fn(),
  fetchPatchLinkedAccount: vi.fn(),
}))

vi.mock("../http", () => ({
  AppHttp: { fetchAppM2MToken: vi.fn() },
}))

const sdkMock = {
  postProfileSearch: vi.fn(),
  getLatestConsents: vi.fn(),
  submitConsents: vi.fn(),
}
const profileSdkMock = {
  createDeleteProfileLifecycleTask: vi.fn(),
  createExportUserDataLifecycleTask: vi.fn(),
  getLifecycleTasks: vi.fn(),
  support: sdkMock,
}
vi.mock("../sdk", () => ({
  getSupportSdk: () => ({ profile: profileSdkMock }),
}))

const { AppHttp } = await import("../http")
const {
  fetchLogtoUserRole,
  fetchLogtoUsers,
  fetchM2MmanagementAccessToken,
  fetchPatchLinkedAccount,
} = await import("./http")
const {
  queryAssociatedProfileIds,
  queryConsentsForProfile,
  queryProfile,
  queryProfileLinkDetails,
  queryRelatedUsersByUserId,
} = await import("./pgAccess")
const { ProfileDataService } = await import("./index")

function baseUser(
  overrides: Partial<ProfileQueryBase> = {},
): ProfileQueryBase & { email: string; public_name: string } {
  return {
    id: "user-1",
    primary_user_id: "user-1",
    email: "u1@test.ie",
    public_name: "User One",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getUserRelationStatus", () => {
  it("returns unlinked when the user has no relations", async () => {
    vi.mocked(queryRelatedUsersByUserId).mockResolvedValue({
      success: true,
      value: [baseUser()],
    })

    const result = await ProfileDataService.getUserRelationStatus("user-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.userIs).toBe("unlinked")
    expect(result.value.userData.id).toBe("user-1")
  })

  it("returns parent with its children", async () => {
    vi.mocked(queryRelatedUsersByUserId).mockResolvedValue({
      success: true,
      value: [
        baseUser(),
        baseUser({ id: "child-1", primary_user_id: "user-1" }),
      ],
    })

    const result = await ProfileDataService.getUserRelationStatus("user-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.userIs).toBe("parent")
    if (result.value.userIs !== "parent") return
    expect(result.value.children.map((c) => c.id)).toEqual(["child-1"])
  })

  it("returns child with its parent", async () => {
    vi.mocked(queryRelatedUsersByUserId).mockResolvedValue({
      success: true,
      value: [
        baseUser({ id: "child-1", primary_user_id: "parent-1" }),
        baseUser({ id: "parent-1", primary_user_id: "parent-1" }),
      ],
    })

    const result = await ProfileDataService.getUserRelationStatus("child-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.userIs).toBe("child")
    if (result.value.userIs !== "child") return
    expect(result.value.parent.id).toBe("parent-1")
  })

  it("fails when the requested user is not in the query result", async () => {
    vi.mocked(queryRelatedUsersByUserId).mockResolvedValue({
      success: true,
      value: [baseUser({ id: "someone-else" })],
    })

    const result = await ProfileDataService.getUserRelationStatus("user-1")

    expect(result.success).toBe(false)
  })

  it("propagates a query failure", async () => {
    vi.mocked(queryRelatedUsersByUserId).mockResolvedValue({
      success: false,
      error: new Error("pg down"),
      userMessage: "err",
    })

    const result = await ProfileDataService.getUserRelationStatus("user-1")

    expect(result.success).toBe(false)
  })
})

describe("getAccountLinkDetails", () => {
  it("maps the query row and filters self out of links", async () => {
    vi.mocked(queryProfileLinkDetails).mockResolvedValue({
      success: true,
      value: {
        ...baseUser(),
        links: [
          {
            id: "user-1",
            email: "u1@test.ie",
            public_name: "User One",
            is_primary: true,
          },
          {
            id: "user-2",
            email: "u2@test.ie",
            public_name: "User Two",
            is_primary: false,
          },
        ],
      },
    })

    const result = await ProfileDataService.getAccountLinkDetails({
      type: "id",
      value: "user-1",
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.isPrimary).toBe(true)
    expect(result.value.links).toEqual([
      { id: "user-2", email: "u2@test.ie", name: "User Two", isPrimary: false },
    ])
  })

  it("propagates a query failure", async () => {
    vi.mocked(queryProfileLinkDetails).mockResolvedValue({
      success: false,
      error: new Error("not found"),
      userMessage: "err",
    })

    const result = await ProfileDataService.getAccountLinkDetails({
      type: "email",
      value: "a@b.ie",
    })

    expect(result.success).toBe(false)
  })
})

describe("createAccountLink", () => {
  it("patches the linked account with the app token", async () => {
    vi.mocked(AppHttp.fetchAppM2MToken).mockResolvedValue({
      success: true,
      value: "token-1",
    })
    vi.mocked(fetchPatchLinkedAccount).mockResolvedValue({
      success: true,
      value: undefined,
    })

    const result = await ProfileDataService.createAccountLink({
      profileId: "p-1",
      primaryUserId: "u-1",
    })

    expect(result.success).toBe(true)
    expect(fetchPatchLinkedAccount).toHaveBeenCalledWith({
      bearerToken: "token-1",
      primaryUserId: "u-1",
      profileId: "p-1",
    })
  })

  it("stops when the token fetch fails", async () => {
    vi.mocked(AppHttp.fetchAppM2MToken).mockResolvedValue({
      success: false,
      error: new Error("no token"),
      userMessage: "err",
    })

    const result = await ProfileDataService.createAccountLink({
      profileId: "p-1",
      primaryUserId: null,
    })

    expect(result.success).toBe(false)
    expect(fetchPatchLinkedAccount).not.toHaveBeenCalled()
  })

  it("propagates a patch failure", async () => {
    vi.mocked(AppHttp.fetchAppM2MToken).mockResolvedValue({
      success: true,
      value: "token-1",
    })
    vi.mocked(fetchPatchLinkedAccount).mockResolvedValue({
      success: false,
      error: new Error("patch failed"),
      userMessage: "err",
    })

    const result = await ProfileDataService.createAccountLink({
      profileId: "p-1",
      primaryUserId: "u-1",
    })

    expect(result.success).toBe(false)
  })
})

describe("getProfiles", () => {
  const searchData = [
    {
      id: "p-1",
      publicName: "User One",
      email: "u1@test.ie",
      primaryUserId: "p-1",
      createdAt: "2025-01-01",
      updatedAt: "2025-01-02",
      preferredLanguage: "en",
      consentStatuses: {},
    },
  ]

  it("merges profile search results with logto data", async () => {
    sdkMock.postProfileSearch.mockResolvedValue({ data: searchData })
    vi.mocked(fetchM2MmanagementAccessToken).mockResolvedValue({
      success: true,
      value: "mgmt-token",
    })
    vi.mocked(fetchLogtoUsers).mockResolvedValue({ success: true, value: [] })
    vi.mocked(fetchLogtoUserRole).mockResolvedValue({
      success: true,
      value: [],
    })

    const result = await ProfileDataService.getProfilesSdk({})

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value).toHaveLength(1)
    expect(result.value[0].id).toBe("p-1")
    expect(result.value[0].public_name).toBe("User One")
  })

  it("still succeeds when logto lookups fail (non-fatal)", async () => {
    sdkMock.postProfileSearch.mockResolvedValue({ data: searchData })
    vi.mocked(fetchM2MmanagementAccessToken).mockResolvedValue({
      success: true,
      value: "mgmt-token",
    })
    vi.mocked(fetchLogtoUsers).mockResolvedValue({
      success: false,
      error: new Error("logto down"),
      userMessage: "err",
    })
    vi.mocked(fetchLogtoUserRole).mockResolvedValue({
      success: false,
      error: new Error("logto down"),
      userMessage: "err",
    })

    const result = await ProfileDataService.getProfilesSdk({})

    expect(result.success).toBe(true)
  })

  it("fails when the profile search errors", async () => {
    sdkMock.postProfileSearch.mockResolvedValue({
      error: new Error("search failed"),
    })

    const result = await ProfileDataService.getProfilesSdk({})

    expect(result.success).toBe(false)
  })

  it("fails when the management token fetch fails", async () => {
    sdkMock.postProfileSearch.mockResolvedValue({ data: searchData })
    vi.mocked(fetchM2MmanagementAccessToken).mockResolvedValue({
      success: false,
      error: new Error("no token"),
      userMessage: "err",
    })

    const result = await ProfileDataService.getProfilesSdk({})

    expect(result.success).toBe(false)
  })
})

describe("getMainProfile", () => {
  function profileRow(
    overrides: Partial<ProfileQueryRow> = {},
  ): ProfileQueryRow {
    return {
      ...baseUser(),
      safe_level: 0,
      created_at: "2025-01-01",
      updated_at: "2025-01-02",
      deleted_at: null,
      preferred_language: "en",
      data: { firstName: "Ada", lastName: "Lovelace", ppsn: "1234567A" },
      status: "active",
      ...overrides,
    }
  }

  it("prefers the primary non-organisation profile", async () => {
    vi.mocked(queryProfile).mockResolvedValue({
      success: true,
      value: [
        profileRow({ id: "org-copy", organisation_id: "org-1" }),
        profileRow(),
      ],
    })

    const result = await ProfileDataService.getMainProfile("user-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.id).toBe("user-1")
    expect(result.value.firstName).toBe("Ada")
  })

  it("falls back to the first row when no primary profile matches", async () => {
    vi.mocked(queryProfile).mockResolvedValue({
      success: true,
      value: [profileRow({ id: "org-copy", organisation_id: "org-1" })],
    })

    const result = await ProfileDataService.getMainProfile("user-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.id).toBe("org-copy")
  })

  it("exposes the primary profile id when viewing a child profile", async () => {
    vi.mocked(queryProfile).mockResolvedValue({
      success: true,
      value: [
        profileRow({ id: "child-1", primary_user_id: "primary-user-1" }),
      ],
    })

    const result = await ProfileDataService.getMainProfile("child-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value.id).toBe("child-1")
    expect(result.value.primaryUserId).toBe("primary-user-1")
  })

  it("fails when the query returns no rows", async () => {
    vi.mocked(queryProfile).mockResolvedValue({ success: true, value: [] })

    const result = await ProfileDataService.getMainProfile("user-1")

    expect(result.success).toBe(false)
  })

  it("propagates a query failure", async () => {
    vi.mocked(queryProfile).mockResolvedValue({
      success: false,
      error: new Error("pg down"),
      userMessage: "err",
    })

    const result = await ProfileDataService.getMainProfile("user-1")

    expect(result.success).toBe(false)
  })
})

describe("getAssociatedProfileIds / getConsents", () => {
  it("passes associated ids through", async () => {
    vi.mocked(queryAssociatedProfileIds).mockResolvedValue({
      success: true,
      value: ["a", "b"],
    })

    const result = await ProfileDataService.getAssociatedProfileIds("user-1")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value).toEqual(["a", "b"])
  })

  it("passes consents through, including failures", async () => {
    vi.mocked(queryConsentsForProfile).mockResolvedValue({
      success: false,
      error: new Error("pg down"),
      userMessage: "err",
    })

    const result = await ProfileDataService.getConsents("user-1")

    expect(result.success).toBe(false)
  })
})

describe("lifecycle tasks", () => {
  it("deleteAccount creates a delete_profile task", async () => {
    profileSdkMock.createDeleteProfileLifecycleTask.mockResolvedValue({
      data: { id: "task-1" },
    })

    const result = await ProfileDataService.deleteAccount({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })

    expect(result.success).toBe(true)
    expect(
      profileSdkMock.createDeleteProfileLifecycleTask,
    ).toHaveBeenCalledWith({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })
  })

  it("deleteAccount fails on sdk error", async () => {
    profileSdkMock.createDeleteProfileLifecycleTask.mockResolvedValue({
      error: new Error("sdk error"),
    })

    const result = await ProfileDataService.deleteAccount({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })

    expect(result.success).toBe(false)
  })

  it("requestDataExport creates an export_user_data task", async () => {
    profileSdkMock.createExportUserDataLifecycleTask.mockResolvedValue({
      data: { id: "task-1" },
    })

    const result = await ProfileDataService.requestDataExport({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })

    expect(result.success).toBe(true)
    expect(
      profileSdkMock.createExportUserDataLifecycleTask,
    ).toHaveBeenCalledWith({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })
  })

  it("requestDataExport fails on sdk error", async () => {
    profileSdkMock.createExportUserDataLifecycleTask.mockResolvedValue({
      error: new Error("sdk error"),
    })

    const result = await ProfileDataService.requestDataExport({
      profileId: "p-1",
      requesterUserId: "agent-1",
    })

    expect(result.success).toBe(false)
  })

  it("getExportTask returns the latest export task", async () => {
    profileSdkMock.getLifecycleTasks.mockResolvedValue({
      data: {
        tasks: [
          {
            id: "task-1",
            type: "export_user_data",
            status: "completed",
            metadata: {
              expiresAt: "2026-09-01T00:00:00.000Z",
              uploadId: "upload-1",
            },
          },
        ],
      },
    })

    const result = await ProfileDataService.getExportTask("p-1")

    expect(result).toEqual({
      success: true,
      value: {
        id: "task-1",
        status: "completed",
        metadata: {
          expiresAt: "2026-09-01T00:00:00.000Z",
          uploadId: "upload-1",
        },
      },
    })
    expect(profileSdkMock.getLifecycleTasks).toHaveBeenCalledWith({
      profileId: "p-1",
      taskType: "export_user_data",
    })
  })

  it("getExportTask returns null when the profile has no export task", async () => {
    profileSdkMock.getLifecycleTasks.mockResolvedValue({
      data: { tasks: [] },
    })

    const result = await ProfileDataService.getExportTask("p-1")

    expect(result).toEqual({ success: true, value: null })
  })

  it("getExportTask fails on sdk error", async () => {
    profileSdkMock.getLifecycleTasks.mockResolvedValue({
      error: new Error("sdk error"),
    })

    const result = await ProfileDataService.getExportTask("p-1")

    expect(result.success).toBe(false)
  })
})

describe("consents via sdk", () => {
  it("getLatestConsentData returns sdk data", async () => {
    sdkMock.getLatestConsents.mockResolvedValue({
      data: { consents: [] },
    })

    const result = await ProfileDataService.getLatestConsentData("p-1")

    expect(result.success).toBe(true)
  })

  it("getLatestConsentData fails on sdk error", async () => {
    sdkMock.getLatestConsents.mockResolvedValue({
      error: new Error("sdk error"),
    })

    const result = await ProfileDataService.getLatestConsentData("p-1")

    expect(result.success).toBe(false)
  })

  it("updateProfileConsentData submits consents", async () => {
    sdkMock.submitConsents.mockResolvedValue({ data: {} })

    const result = await ProfileDataService.updateProfileConsentData({
      profileId: "p-1",
      consents: [{ subject: "marketing", status: "opted-in" }],
    })

    expect(result.success).toBe(true)
    expect(sdkMock.submitConsents).toHaveBeenCalledWith({
      profileId: "p-1",
      consents: [{ subject: "marketing", status: "opted-in" }],
    })
  })

  it("updateProfileConsentData fails on sdk error", async () => {
    sdkMock.submitConsents.mockResolvedValue({
      error: new Error("sdk error"),
    })

    const result = await ProfileDataService.updateProfileConsentData({
      profileId: "p-1",
      consents: [],
    })

    expect(result.success).toBe(false)
  })
})
