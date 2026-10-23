import { getAccessToken } from "@ogcio/api-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLogtoClient } from "~/clients/logto.js";
import {
  BB_CITIZEN_ROLE_ID,
  ONBOARDING_CANDIDATE_ROLE_ID,
} from "~/const/logto.js";
import { createLogtoUsers } from "~/services/profiles/create-logto-users.js";
import {
  mockLogger,
  mockLogtoConfig,
  mockLogtoUsers,
  mockProfiles,
} from "~/test/fixtures/common.js";

// Mock dependencies
vi.mock("@ogcio/api-auth", () => ({
  getAccessToken: vi.fn().mockResolvedValue("mock-token"),
}));

vi.mock("~/clients/logto.js", () => ({
  LogtoClient: vi.fn(),
  buildLogtoClient: vi.fn(),
}));

describe("createLogtoUsers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create users in Logto successfully", async () => {
    const mockCreateUser = vi
      .fn()
      .mockResolvedValueOnce(mockLogtoUsers[0])
      .mockResolvedValueOnce(mockLogtoUsers[1]);

    const mockAssignUserRole = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      createUser: mockCreateUser,
      assignUserRole: mockAssignUserRole,
    };

    // Mock buildLogtoClient to call getAccessToken and return our mock client
    vi.mocked(buildLogtoClient).mockImplementation(async (config) => {
      await getAccessToken({
        resource: config.LOGTO_MANAGEMENT_API_RESOURCE_URL,
        scopes: ["all"],
        applicationId: config.LOGTO_MANAGEMENT_API_CLIENT_ID,
        applicationSecret: config.LOGTO_MANAGEMENT_API_CLIENT_SECRET,
        logtoOidcEndpoint: config.LOGTO_OIDC_ENDPOINT,
      });
      return mockClient as never;
    });

    const results = await createLogtoUsers(
      mockProfiles,
      mockLogtoConfig,
      "org-123",
      "job-123",
      true,
      false,
      mockLogger,
    );

    expect(results).toEqual(mockLogtoUsers);

    expect(getAccessToken).toHaveBeenCalledWith({
      resource: mockLogtoConfig.LOGTO_MANAGEMENT_API_RESOURCE_URL,
      scopes: ["all"],
      applicationId: mockLogtoConfig.LOGTO_MANAGEMENT_API_CLIENT_ID,
      applicationSecret: mockLogtoConfig.LOGTO_MANAGEMENT_API_CLIENT_SECRET,
      logtoOidcEndpoint: mockLogtoConfig.LOGTO_OIDC_ENDPOINT,
    });

    expect(mockCreateUser).toHaveBeenCalledTimes(2);
    expect(mockAssignUserRole).toHaveBeenCalledWith(
      "user-1",
      BB_CITIZEN_ROLE_ID,
    );
    expect(mockAssignUserRole).toHaveBeenCalledWith(
      "user-1",
      ONBOARDING_CANDIDATE_ROLE_ID,
    );
    expect(mockAssignUserRole).toHaveBeenCalledWith(
      "user-2",
      BB_CITIZEN_ROLE_ID,
    );
    expect(mockAssignUserRole).toHaveBeenCalledWith(
      "user-2",
      ONBOARDING_CANDIDATE_ROLE_ID,
    );
    expect(mockCreateUser).toHaveBeenCalledWith({
      primaryEmail: mockProfiles[0].email,
      name: "John Doe",
      customData: {
        organizationId: "org-123",
        profileImportId: "job-123",
        insertPrivateDetails: true,
        onlyPrivateDetails: false,
      },
    });
  });

  it("should handle partial failures and track successful emails", async () => {
    const mockCreateUser = vi
      .fn()
      .mockResolvedValueOnce({ id: "user-1", primaryEmail: "john@example.com" })
      .mockRejectedValueOnce(new Error("Failed to create user"));

    const mockClient = {
      createUser: mockCreateUser,
      assignUserRole: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(buildLogtoClient).mockResolvedValue(mockClient as never);

    const promise = createLogtoUsers(
      mockProfiles,
      mockLogtoConfig,
      "org-123",
      "job-123",
      false,
      false,
      mockLogger,
    );

    await expect(promise).rejects.toThrow(
      "job-123 [Logto] | 1 users failed to be created: Error: Failed to create user",
    );
    await expect(promise).rejects.toMatchObject({
      successfulEmails: ["john@example.com"],
    });
  });

  it("should process users in batches with delay", async () => {
    const manyProfiles = Array(15)
      .fill(null)
      .map((_, i) => ({
        email: `user${i}@example.com`,
        firstName: `User${i}`,
        lastName: "Test",
      }));

    const mockCreateUser = vi.fn().mockImplementation((userData) =>
      Promise.resolve({
        id: `id-${userData.primaryEmail}`,
        primaryEmail: userData.primaryEmail,
      }),
    );

    const mockClient = {
      createUser: mockCreateUser,
      assignUserRole: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(buildLogtoClient).mockResolvedValue(mockClient as never);

    const promise = createLogtoUsers(
      manyProfiles,
      mockLogtoConfig,
      "org-123",
      "job-123",
      false,
      false,
      mockLogger,
    );
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(15);
    expect(mockCreateUser).toHaveBeenCalledTimes(15);
  });

  it("should manage users with multiple spaces in long names", async () => {
    const mockProfile = {
      email: "john@example.com",
      firstName: "John  NAME",
      lastName:
        "Do  e last   REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_REALLY_LONG",
      phone: "1234567890",
      dateOfBirth: "1990-01-01",
      address: "123 Test St",
      city: "Test City",
      externalId: "1234567890",
      ppsn: "1234567TA",
    };

    const expectedName = [mockProfile.firstName, mockProfile.lastName]
      .join(" ")
      .substring(0, 128);
    const mockCreateUser = vi.fn().mockResolvedValueOnce(mockLogtoUsers[0]);

    const mockClient = {
      createUser: mockCreateUser,
      assignUserRole: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(buildLogtoClient).mockResolvedValue(mockClient as never);

    await createLogtoUsers(
      [mockProfile],
      mockLogtoConfig,
      "org-123",
      "job-123",
      true,
      false,
      mockLogger,
    );

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledWith({
      primaryEmail: mockProfile.email,
      name: expectedName,
      customData: {
        organizationId: "org-123",
        profileImportId: "job-123",
        insertPrivateDetails: true,
        onlyPrivateDetails: false,
      },
    });
  });

  it("does not count a user as created when role assignment fails", async () => {
    const mockCreateUser = vi
      .fn()
      .mockResolvedValue({ id: "user-1", primaryEmail: "john@example.com" });
    const mockClient = {
      createUser: mockCreateUser,
      assignUserRole: vi
        .fn()
        .mockRejectedValue(new Error("role assign failed")),
    };
    vi.mocked(buildLogtoClient).mockResolvedValue(mockClient as never);

    const promise = createLogtoUsers(
      [mockProfiles[0]],
      mockLogtoConfig,
      "org-123",
      "job-123",
      false,
      false,
      mockLogger,
    );

    await expect(promise).rejects.toMatchObject({ successfulEmails: [] });
  });
});
