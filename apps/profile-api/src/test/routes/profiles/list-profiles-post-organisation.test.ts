import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUpdateProfileDetails } from "~/services/profiles/create-update-profile-details.js";
import { createProfile } from "~/services/profiles/sql/create-profile.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "~/test/build-testcontainer-pg.js";
import { mockDbProfiles } from "~/test/fixtures/common.js";
import { buildOnce, type MockAuthConfig } from "~/test/test-server-builder.js";

describe("POST /api/v1/profiles organisation scope", () => {
  let app: FastifyInstance;
  let setAuth: (config: MockAuthConfig) => void;
  const pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
  const ownOrgId = randomUUID().substring(0, 11);
  const otherOrgId = randomUUID().substring(0, 11);
  const ppsn = randomUUID().substring(0, 9);
  const ownProfileId = randomUUID().substring(0, 12);
  const otherProfileId = randomUUID().substring(0, 12);

  async function seedProfile(profileId: string, organizationId: string) {
    const client = await pool.connect();
    try {
      const created = await createProfile(client, {
        ...mockDbProfiles[0],
        id: profileId,
        email: `${randomUUID().substring(0, 8)}@example.com`,
        primaryUserId: profileId,
      });
      await createUpdateProfileDetails({
        client,
        organizationId,
        profileId: created,
        data: { firstName: "Org", lastName: "Scoped", ppsn },
        createOnly: false,
      });
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    const server = await buildOnce();
    app = server.app;
    setAuth = server.setAuth;
    await seedProfile(ownProfileId, ownOrgId);
    await seedProfile(otherProfileId, otherOrgId);
  });

  afterAll(async () => {
    if (!pool.ended) {
      await pool.end();
    }
    await app?.close();
  });

  async function listByPpsn() {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/profiles",
      payload: { ppsns: [ppsn] },
    });
    expect(response.statusCode).toBe(200);
    return (response.json().data as { id: string }[]).map((p) => p.id);
  }

  it("returns only the token organisation's profiles when the body omits organizationId", async () => {
    setAuth({ userId: "m2m-app", organizationId: ownOrgId });

    expect(await listByPpsn()).toEqual([ownProfileId]);
  });

  it("returns profiles across organisations for a token without an organisation", async () => {
    setAuth({ userId: "platform-admin" });

    expect((await listByPpsn()).sort()).toEqual(
      [ownProfileId, otherProfileId].sort(),
    );
  });
});
