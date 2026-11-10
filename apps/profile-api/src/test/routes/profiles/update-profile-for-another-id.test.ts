import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { LogtoClient } from "~/clients/logto.js";
import type { ProfileWithDetails } from "~/schemas/profiles/model.js";
import type { PutProfileBody } from "~/schemas/profiles/update.js";
import { createProfile } from "~/services/profiles/sql/create-profile.js";
import { createProfileDataForProfileDetail } from "~/services/profiles/sql/create-profile-data-for-profile-details.js";
import { createProfileDetails } from "~/services/profiles/sql/create-profile-details.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "~/test/build-testcontainer-pg.js";
import { buildOnce } from "~/test/test-server-builder.js";

const sentMessages: { id: string; recipientUserId: string }[] = [];

function sendMessageTo(recipientUserId: string): string {
  const id = randomUUID();
  sentMessages.push({ id, recipientUserId });
  return id;
}

const organizationId = "org-id";
const pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);

const patchTestParam = {
  method: "PATCH" as "PUT" | "PATCH",
  ...(await createUser(
    pool,
    getFullBody(),
    getFullBody(),
    randomUUID().substring(0, 12),
    organizationId,
    false,
  )),
};
const updateRequestedById = randomUUID().substring(0, 12);
const updateRequestedBy = await createUser(
  pool,
  getFullBody(),
  getFullBody(),
  updateRequestedById,
  organizationId,
  true,
);

const { app, setAuth } = await buildOnce();
await app.ready();
app.getMessagingSupportSdk = () =>
  ({
    postMessagesSearch: async (
      _query: unknown,
      body: { recipientUserIds: string[] },
    ) => ({
      data: sentMessages.filter((m) =>
        body.recipientUserIds.includes(m.recipientUserId),
      ),
    }),
  }) as unknown as ReturnType<typeof app.getMessagingSupportSdk>;

afterAll(async () => {
  await app.close();
});

describe(`${patchTestParam.method} - /api/v1/profiles/{id} - Another profile`, async () => {
  beforeEach(() => {
    setAuth({ userId: updateRequestedById });
  });

  it("Returns 400 if org id is set", async () => {
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      query: { organizationId },
      body: { primaryUserId: updateRequestedById },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Returns 400 if primary user id is not set", async () => {
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      body: { publicName: "Public Name", email: "public@name.com" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Returns 400 if other fields than primary user id are set", async () => {
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      body: {
        publicName: "Public Name",
        email: "public@name.com",
        primaryUserId: updateRequestedById,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Returns 404 if to update user does not exist", async () => {
    const response = await app.inject({
      method: patchTestParam.method,
      url: "/api/v1/profiles/not-exist",
      body: {
        primaryUserId: updateRequestedById,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it("Returns 400 if the primary user id is different than the logged in user", async () => {
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      body: {
        primaryUserId: "another id",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Returns 400 if the profile to update already logged in with Logto", async () => {
    app.getLogtoClient = () =>
      Promise.resolve({
        getUser: (userId: string) => ({
          id: userId,
          lastSignInAt: Date.now(),
        }),
      } as unknown as LogtoClient);
    const loggedInUser = randomUUID().substring(0, 12);
    // create a user with generic details,
    // meaning it already logged in
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      loggedInUser,
      organizationId,
      true,
    );
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${loggedInUser}`,
      body: {
        primaryUserId: updateRequestedById,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Returns 200 if the profile to update has private details but not signin at in Logto", async () => {
    app.getLogtoClient = () =>
      Promise.resolve({
        getUser: (userId: string) => ({
          id: userId,
          lastSignInAt: null,
        }),
      } as unknown as LogtoClient);
    const loggedInUser = randomUUID().substring(0, 12);
    // create a user with generic details,
    // meaning it already logged in
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      loggedInUser,
      organizationId,
      true,
    );
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${loggedInUser}`,
      query: { messageId: sendMessageTo(loggedInUser) },
      body: {
        primaryUserId: updateRequestedById,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("Returns 403 without a message addressed to the profile to link", async () => {
    const toLinkId = randomUUID().substring(0, 12);
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      toLinkId,
      organizationId,
      false,
    );

    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${toLinkId}`,
      body: { primaryUserId: updateRequestedById },
    });

    expect(response.statusCode).toBe(403);
  });

  it("Returns 403 when the message was sent to a different profile", async () => {
    const toLinkId = randomUUID().substring(0, 12);
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      toLinkId,
      organizationId,
      false,
    );

    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${toLinkId}`,
      query: { messageId: sendMessageTo(randomUUID().substring(0, 12)) },
      body: { primaryUserId: updateRequestedById },
    });

    expect(response.statusCode).toBe(403);
  });

  it("Returns 400 if the primary user id is already different than profile id itself", async () => {
    const toUpdateUserId = randomUUID().substring(0, 12);
    // create a user with another primary user id
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      toUpdateUserId,
      organizationId,
      false,
      randomUUID().substring(0, 12),
    );

    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${toUpdateUserId}`,
      body: {
        primaryUserId: updateRequestedById,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Returns 404 if the profile that requests update does not exist", async () => {
    const notExistId = randomUUID().substring(0, 12);
    setAuth({ userId: notExistId });

    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      body: {
        primaryUserId: notExistId,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it("Returns 400 if the profile that requests update is a child", async () => {
    const updaterId = randomUUID().substring(0, 12);
    // create the updater user with another
    // primary user id, meaning it's a child
    await createUser(
      pool,
      getFullBody(),
      getFullBody(),
      updaterId,
      organizationId,
      true,
      randomUUID().substring(0, 12),
    );

    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      body: {
        primaryUserId: updaterId,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("Updates data as expected", async () => {
    const response = await app.inject({
      method: patchTestParam.method,
      url: `/api/v1/profiles/${patchTestParam.profileId}`,
      query: { messageId: sendMessageTo(patchTestParam.profileId) },
      body: {
        primaryUserId: updateRequestedBy.profileId,
      },
    });
    expect(response.statusCode).toBe(200);
    const responseBody = response.json().data as ProfileWithDetails;

    expect(responseBody.id).toStrictEqual(patchTestParam.profileId);
    expect(responseBody.publicName).toStrictEqual(
      patchTestParam.withoutOrgBody.publicName,
    );
    expect(responseBody.email).toStrictEqual(
      patchTestParam.withoutOrgBody.email,
    );
    expect(responseBody.primaryUserId).toStrictEqual(
      updateRequestedBy.profileId,
    );
    expect(responseBody.preferredLanguage).toStrictEqual(
      patchTestParam.withoutOrgBody.preferredLanguage,
    );
    // They have to be undefined because child profile
    // didn't login yet
    expect(responseBody.details).not.toBeDefined();
  });
});

const putTestParam = {
  method: "PUT" as "PUT" | "PATCH",
  ...(await createUser(
    pool,
    getFullBody(),
    getFullBody(),
    randomUUID().substring(0, 12),
    organizationId,
    false,
  )),
};

describe("PUT - /api/v1/profiles/{id} - Another profile", async () => {
  it("Cannot invoke PUT for another profile with org query", async () => {
    setAuth({ userId: putTestParam.profileId });
    const inputBody = getFullBody();

    const response = await app.inject({
      method: putTestParam.method,
      url: "/api/v1/profiles/another-id",
      query: organizationId,
      body: inputBody,
    });

    expect(response.statusCode).toBe(403);
  });

  it("Cannot invoke PUT for another profile", async () => {
    setAuth({ userId: putTestParam.profileId });
    const inputBody = getFullBody();

    const response = await app.inject({
      method: putTestParam.method,
      url: "/api/v1/profiles/another-id",
      body: inputBody,
    });

    expect(response.statusCode).toBe(403);
  });
});

function getFullBody(): Required<PutProfileBody> {
  return {
    publicName: "Public Name",
    email: "public@name.com",
    phone: "+3333333",
    address: "Road",
    city: "City",
    firstName: "First",
    lastName: "Last",
    dateOfBirth: "2000-01-02",
    preferredLanguage: "ga",
  };
}

async function createUser(
  pool: Pool,
  withoutOrgBody: Omit<Required<PutProfileBody>, "publicName" | "email">,
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
      email: withOrgBody.email,
    },
    profileId,
  };
}
