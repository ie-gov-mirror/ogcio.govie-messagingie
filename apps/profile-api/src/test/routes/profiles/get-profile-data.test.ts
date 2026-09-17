import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CascadeConsentReasons,
  ConsentSubjects,
} from "~/schemas/consents/shared.js";
import {
  ProfileStatuses,
  type ProfileWithDetails,
  type ProfileWithLinkedProfiles,
} from "~/schemas/profiles/model.js";
import type { PutProfileBody } from "~/schemas/profiles/update.js";
import { getCurrentConsentStatement } from "~/services/consent-statements/consent-statements-service.js";
import { submitConsent } from "~/services/consents/consents-service.js";
import { createProfile } from "~/services/profiles/sql/create-profile.js";
import { createProfileDataForProfileDetail } from "~/services/profiles/sql/create-profile-data-for-profile-details.js";
import { createProfileDetails } from "~/services/profiles/sql/create-profile-details.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "~/test/build-testcontainer-pg.js";
import { mockLogger } from "~/test/fixtures/common.js";
import { buildOnce, type MockAuthConfig } from "~/test/test-server-builder.js";

let app: FastifyInstance;
let setAuth: (config: MockAuthConfig) => void;

describe("GET /api/v1/profiles/{id} data", async () => {
  const loggedInUser = randomUUID().substring(0, 12);
  const organizationId = randomUUID().substring(0, 10);
  const pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
  let withOrgBody: PutProfileBody | undefined;
  let withoutOrgBody: PutProfileBody | undefined;

  beforeAll(async () => {
    const server = await buildOnce();
    app = server.app;
    setAuth = server.setAuth;

    const created = await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      loggedInUser,
      organizationId,
      true,
    );
    withOrgBody = created.withOrgBody;
    withoutOrgBody = created.withoutOrgBody;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("Returns 404 if a citizen asks for its profile but does not exist", async () => {
    const currentId = randomUUID().substring(0, 12);
    app = getServer({
      userId: currentId,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${currentId}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("Returns 404 if a public servant asks for its profile but does not exist", async () => {
    const currentId = randomUUID().substring(0, 12);
    app = getServer({
      userId: currentId,
      hasOnboardingPermissions: false,
      organizationId: organizationId,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${currentId}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("Returns expected data when a citizen asks for itself", async () => {
    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}`,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json()).data as ProfileWithDetails;
    const { createdAt, updatedAt, ...withoutTimestampsBody } = {
      ...responseBody,
    };
    expect(withoutTimestampsBody).toEqual({
      id: loggedInUser,
      // main must remain equal to withOrgBody because
      // the main profile has been created using those values
      publicName: withOrgBody?.publicName,
      email: withoutOrgBody?.email,
      primaryUserId: loggedInUser,
      preferredLanguage: withoutOrgBody?.preferredLanguage,
      // at this point consent statuses are null on db
      consentStatuses: null,
      details: {
        email: withoutOrgBody?.email,
        firstName: withoutOrgBody?.firstName,
        lastName: withoutOrgBody?.lastName,
        city: withoutOrgBody?.city,
        address: withoutOrgBody?.address,
        phone: withoutOrgBody?.phone,
        dateOfBirth: `${withoutOrgBody?.dateOfBirth}T00:00:00.000Z`,
        preferredLanguage: withoutOrgBody?.preferredLanguage,
      },
      status: ProfileStatuses.Active,
    });
  });

  it("Returns expected data when a citizen asks for itself organization related", async () => {
    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}`,
      query: {
        organizationId,
      },
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json()).data as ProfileWithDetails;
    const { createdAt, updatedAt, ...withoutTimestampsBody } = {
      ...responseBody,
    };
    expect(withoutTimestampsBody).toEqual({
      id: loggedInUser,
      // main must remain equal to withOrgBody because
      // the main profile has been created using those values
      publicName: withOrgBody?.publicName,
      email: withOrgBody?.email,
      primaryUserId: loggedInUser,
      preferredLanguage: withOrgBody?.preferredLanguage,
      consentStatuses: null,
      details: {
        email: withOrgBody?.email,
        firstName: withOrgBody?.firstName,
        lastName: withOrgBody?.lastName,
        city: withOrgBody?.city,
        address: withOrgBody?.address,
        phone: withOrgBody?.phone,
        dateOfBirth: `${withOrgBody?.dateOfBirth}T00:00:00.000Z`,
        preferredLanguage: withOrgBody?.preferredLanguage,
      },
      status: ProfileStatuses.Active,
    });
  });

  it("Returns linked profiles data when a citizen asks for itself and has linked profiles", async () => {
    const childData = await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      randomUUID().substring(0, 12),
      organizationId,
      false,
      loggedInUser,
    );

    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}`,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json()).data as ProfileWithDetails;
    const { createdAt, updatedAt, ...withoutTimestampsBody } = {
      ...responseBody,
    };
    expect(withoutTimestampsBody).toEqual({
      id: loggedInUser,
      // main must remain equal to withOrgBody because
      // the main profile has been created using those values
      publicName: withOrgBody?.publicName,
      email: withoutOrgBody?.email,
      primaryUserId: loggedInUser,
      preferredLanguage: withoutOrgBody?.preferredLanguage,
      consentStatuses: null,
      details: {
        email: withoutOrgBody?.email,
        firstName: withoutOrgBody?.firstName,
        lastName: withoutOrgBody?.lastName,
        city: withoutOrgBody?.city,
        address: withoutOrgBody?.address,
        phone: withoutOrgBody?.phone,
        dateOfBirth: `${withoutOrgBody?.dateOfBirth}T00:00:00.000Z`,
        preferredLanguage: withoutOrgBody?.preferredLanguage,
      },
      linkedProfiles: [
        {
          id: childData.profileId,
          email: childData.withOrgBody.email,
          publicName: childData.withOrgBody.publicName,
        },
      ],
      status: ProfileStatuses.Active,
    });
  });

  it("Do not return linked profiles data when a citizen asks for itself with organization and has linked profiles", async () => {
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      randomUUID().substring(0, 12),
      organizationId,
      false,
      loggedInUser,
    );

    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}`,
      query: {
        organizationId,
      },
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json())
      .data as ProfileWithLinkedProfiles;
    expect(responseBody.linkedProfiles).toBeUndefined();
  });

  it("Do not return linked profiles data when a public servant asks for a related citizen and has linked profiles", async () => {
    const searchingForId = randomUUID().substring(0, 12);
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      searchingForId,
      organizationId,
      false,
      loggedInUser,
    );
    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${searchingForId}`,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json())
      .data as ProfileWithLinkedProfiles;
    expect(responseBody.linkedProfiles).toBeUndefined();
  });

  it("Returns linked profiles data when an onboarding user asks for a user and has linked profiles", async () => {
    const mainProfile = await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      randomUUID().substring(0, 12),
      organizationId,
      true,
    );
    const childData = await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      randomUUID().substring(0, 12),
      organizationId,
      false,
      mainProfile.profileId,
    );

    app = getServer({
      userId: childData.profileId,
      hasOnboardingPermissions: true,
      organizationId: undefined,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${mainProfile.profileId}`,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json()).data as ProfileWithDetails;
    const { createdAt, updatedAt, ...withoutTimestampsBody } = {
      ...responseBody,
    };
    expect(withoutTimestampsBody).toEqual({
      id: mainProfile.profileId,
      // main must remain equal to withOrgBody because
      // the main profile has been created using those values
      publicName: mainProfile.withOrgBody.publicName,
      email: mainProfile.withoutOrgBody.email,
      primaryUserId: mainProfile.profileId,
      preferredLanguage: mainProfile.withoutOrgBody.preferredLanguage,
      consentStatuses: null,
      details: {
        email: mainProfile.withoutOrgBody.email,
        firstName: mainProfile.withoutOrgBody.firstName,
        lastName: mainProfile.withoutOrgBody.lastName,
        city: mainProfile.withoutOrgBody.city,
        address: mainProfile.withoutOrgBody.address,
        phone: mainProfile.withoutOrgBody.phone,
        dateOfBirth: `${mainProfile.withoutOrgBody.dateOfBirth}T00:00:00.000Z`,
        preferredLanguage: mainProfile.withoutOrgBody.preferredLanguage,
      },
      linkedProfiles: [
        {
          id: childData.profileId,
          email: childData.withOrgBody.email,
          publicName: childData.withOrgBody.publicName,
        },
      ],
      status: ProfileStatuses.Active,
    });
  });

  it("Returns 403 when an onboarding user asks for an unrelated profile", async () => {
    app = getServer({
      userId: "unrelated-user",
      hasOnboardingPermissions: true,
      organizationId: undefined,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}`,
    });

    expect(response.statusCode).toBe(403);
  });

  it("Returns expected data when a public servant asks for itself private details", async () => {
    const mainProfile = await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      randomUUID().substring(0, 12),
      organizationId,
      true,
    );
    app = getServer({
      userId: mainProfile.profileId,
      hasOnboardingPermissions: false,
      organizationId,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${mainProfile.profileId}`,
    });

    expect(response.statusCode).toBe(200);
    const responseBody = (await response.json()).data as ProfileWithDetails;
    const { createdAt, updatedAt, ...withoutTimestampsBody } = {
      ...responseBody,
    };
    expect(withoutTimestampsBody).toEqual({
      id: mainProfile.profileId,
      // main must remain equal to withOrgBody because
      // the main profile has been created using those values
      publicName: mainProfile.withOrgBody?.publicName,
      email: mainProfile.withoutOrgBody?.email,
      primaryUserId: mainProfile.profileId,
      preferredLanguage: mainProfile.withOrgBody?.preferredLanguage,
      consentStatuses: null,
      details: {
        email: mainProfile.withoutOrgBody?.email,
        firstName: mainProfile.withoutOrgBody?.firstName,
        lastName: mainProfile.withoutOrgBody?.lastName,
        city: mainProfile.withoutOrgBody?.city,
        address: mainProfile.withoutOrgBody?.address,
        phone: mainProfile.withoutOrgBody?.phone,
        dateOfBirth: `${mainProfile.withoutOrgBody?.dateOfBirth}T00:00:00.000Z`,
        preferredLanguage: mainProfile.withoutOrgBody?.preferredLanguage,
      },
      status: ProfileStatuses.Active,
    });
  });

  it("Returns null consent status if requested but null on db", async () => {
    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}?consentSubjects=${ConsentSubjects.Messaging}`,
    });
    if (response.statusCode !== 200) {
      console.log("GET profile - testing consent statuses - Expected null", {
        withConsentResponse: JSON.parse(response.body),
      });
    }
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body).data as ProfileWithDetails;
    // Null because null on db
    expect(responseBody.consentStatuses).toBeNull();
  });

  it("Returns consent status if requested and available on db", async () => {
    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });
    const messagingStatement = await getCurrentConsentStatement({
      subject: ConsentSubjects.Messaging,
      pool,
    });
    await submitConsent({
      userId: loggedInUser,
      logger: mockLogger,
      consentInput: {
        status: "opted-in",
        subject: ConsentSubjects.Messaging,
        consentStatementId: messagingStatement.id,
      },
      reason: CascadeConsentReasons.ExplicitSubmission,
      pool: pool,
    });

    const withConsentResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}?consentSubjects=${ConsentSubjects.Messaging}`,
    });

    if (withConsentResponse.statusCode !== 200) {
      console.log("GET profile - testing consent statuses", {
        withConsentResponse: JSON.parse(withConsentResponse.body),
      });
    }
    expect(withConsentResponse.statusCode).toBe(200);
    const withConsentResponseBody = JSON.parse(withConsentResponse.body)
      .data as ProfileWithDetails;

    expect(withConsentResponseBody.consentStatuses).toEqual({
      [ConsentSubjects.Messaging]: {
        subject: ConsentSubjects.Messaging,
        status: "opted-in",
        statementId: messagingStatement.id,
        statementVersion: expect.any(Number),
        isLatestStatement: expect.any(Boolean),
        submittedAt: expect.any(String),
      },
    });
  });

  it("Returns null consent status if not requested but available on db", async () => {
    app = getServer({
      userId: loggedInUser,
      hasOnboardingPermissions: false,
      organizationId: undefined,
    });
    const messagingStatement = await getCurrentConsentStatement({
      subject: ConsentSubjects.Messaging,
      pool,
    });
    await submitConsent({
      userId: loggedInUser,
      logger: mockLogger,
      consentInput: {
        status: "opted-out",
        subject: ConsentSubjects.Messaging,
        consentStatementId: messagingStatement.id,
      },
      reason: CascadeConsentReasons.ExplicitSubmission,
      pool: pool,
    });

    const withConsentResponse = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${loggedInUser}`,
    });

    if (withConsentResponse.statusCode !== 200) {
      console.log("GET profile - testing consent statuses", {
        withConsentResponse: JSON.parse(withConsentResponse.body),
      });
    }
    expect(withConsentResponse.statusCode).toBe(200);
    const withConsentResponseBody = JSON.parse(withConsentResponse.body)
      .data as ProfileWithDetails;

    expect(withConsentResponseBody.consentStatuses).toBeNull();
  });
});

function getFullBody(): Required<PutProfileBody> {
  return {
    publicName: `${randomUUID().substring(0, 5)} ${randomUUID().substring(0, 6)}`,
    email: `${randomUUID().substring(0, 5)}@name.com`,
    phone: "+3333333",
    address: "Road",
    city: "City",
    firstName: "First",
    lastName: "Last",
    dateOfBirth: "2000-01-02",
    preferredLanguage: "ga",
  };
}

function getServer({
  userId,
  hasOnboardingPermissions,
  organizationId,
}: {
  userId: string;
  hasOnboardingPermissions: boolean;
  organizationId: string | undefined;
}): FastifyInstance {
  setAuth({ userId, hasOnboardingPermissions, organizationId });
  return app;
}

async function createUser(
  pool: Pool,
  withoutOrgBody: Omit<Required<PutProfileBody>, "publicName">,
  withOrgBody: Required<PutProfileBody>,
  profileId: string,
  organizationId: string,
  createGenericDetails: boolean,
  toSetPrimaryUserId?: string,
) {
  const beforeAllClient = await pool.connect();
  await createProfile(beforeAllClient, {
    ...withOrgBody,
    primaryUserId: toSetPrimaryUserId ?? profileId,
    id: profileId,
  });
  const createdDetails = await createProfileDetails(
    beforeAllClient,
    profileId,
    organizationId,
  );

  await createProfileDataForProfileDetail(
    beforeAllClient,
    createdDetails,
    withOrgBody,
  );
  if (createGenericDetails) {
    const createdDetailsGeneric = await createProfileDetails(
      beforeAllClient,
      profileId,
      undefined,
    );

    await createProfileDataForProfileDetail(
      beforeAllClient,
      createdDetailsGeneric,
      withoutOrgBody,
    );
  }
  beforeAllClient.release();

  return {
    withOrgBody,
    withoutOrgBody: {
      ...withoutOrgBody,
      publicName: withOrgBody.publicName,
    },
    profileId,
  };
}
