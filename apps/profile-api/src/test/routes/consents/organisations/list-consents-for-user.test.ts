import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CascadeConsentReason,
  CascadeConsentReasons,
  ConsentStatuses,
  type ConsentWithStatement,
} from "~/schemas/consents/shared.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "~/test/build-testcontainer-pg.js";
import { insertTestConsentStatement } from "~/test/insert-test-consent-statement.js";
import { build } from "~/test/test-server-builder.js";

const pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
const organisationId = "org-list-consents-123";
const subject = "org-list-consent-ps-test";
let consentStatementId = randomUUID() as string;
let consentStatementVersion = 1;

async function createProfileWithConsent({
  profileId = randomUUID().substring(0, 12),
  detailsId = randomUUID(),
  consentStatus = "opted-in",
  consentCreatedAt = new Date(),
  subject = "org-list-consent-ps-test",
  organisationId = "org-list-consents-123",
  cascadeReason = null,
  cascadeSourceProfileId = null,
}: {
  profileId?: string;
  detailsId?: string;
  consentStatus?: string;
  consentCreatedAt?: Date;
  subject?: string;
  organisationId?: string;
  cascadeReason?: CascadeConsentReason | null;
  cascadeSourceProfileId?: string | null;
} = {}) {
  await pool.query(
    `INSERT INTO profiles (id, public_name, email, primary_user_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $1, NOW(), NOW())`,
    [profileId, "Test User", `${profileId}@mail.com`],
  );
  await pool.query(
    `INSERT INTO profile_details (id, profile_id, organisation_id, is_latest)
		 VALUES ($1, $2, $3, true)`,
    [detailsId, profileId, organisationId],
  );
  await pool.query(
    `INSERT INTO profile_consents (profile_id, subject, status, created_at, consent_statement_id, cascade_reason, cascade_source_profile_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      profileId,
      subject,
      consentStatus,
      consentCreatedAt,
      consentStatementId,
      cascadeReason,
      cascadeSourceProfileId,
    ],
  );
  return profileId;
}

async function insertConsentStatement(
  pool: Pool,
  subject: string,
): Promise<{ id: string; version: number }> {
  const statement = await insertTestConsentStatement(pool, {
    subject: subject,
    publishDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Ensure at least 24 hours in the future
    isEnabled: true,
  });
  return statement;
}

describe("GET /api/v1/organisations/consents", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getServer();
    const { id, version } = await insertConsentStatement(pool, subject);
    consentStatementId = id;
    consentStatementVersion = version;
  });
  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (pool && !pool.ended) {
      await pool.end();
    }
  });

  it("returns empty array if no consents exist for subject and profile", async () => {
    const profileId = randomUUID().substring(0, 12);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consents",
      query: { subject, profileId },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toEqual([]);
    expect(body.metadata.totalCount).toBe(0);
  });

  it("returns no consents for a profile in another organisation", async () => {
    const profileId = await createProfileWithConsent({
      organisationId: "another-organisation",
      subject,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consents",
      query: { subject, profileId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toEqual([]);
    expect(body.metadata.totalCount).toBe(0);
  });

  it("returns all consents for a profile and subject, ordered by created_at DESC", async () => {
    const profileId = await createProfileWithConsent({
      profileId: "list-prof-1",
      consentStatus: ConsentStatuses.OptedIn,
      consentCreatedAt: new Date(Date.now() - 2000),
      organisationId,
      subject,
    });
    // Insert another consent for the same profile (should be returned first)
    await pool.query(
      `INSERT INTO profile_consents (profile_id, subject, status, created_at, consent_statement_id)
			 VALUES ($1, $2, $3, $4, $5)`,
      [
        profileId,
        subject,
        ConsentStatuses.OptedOut,
        new Date(Date.now() - 1000),
        consentStatementId,
      ],
    );
    // Insert a third consent
    await pool.query(
      `INSERT INTO profile_consents (profile_id, subject, status, created_at, consent_statement_id)
			 VALUES ($1, $2, $3, $4, $5)`,
      [
        profileId,
        subject,
        ConsentStatuses.OptedIn,
        new Date(Date.now()),
        consentStatementId,
      ],
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consents",
      query: { subject, profileId },
    });

    if (response.statusCode !== 200) {
      console.log(
        "Returns all consents for a profile and subject",
        JSON.parse(response.body),
      );
    }

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { data: ConsentWithStatement[] };
    expect(body.data.length).toBe(3);
    // Should be ordered by created_at DESC
    expect(body.data[0].status).toBe(ConsentStatuses.OptedIn);
    expect(body.data[0].consentStatement.version).toBe(consentStatementVersion);
    expect(body.data[1].status).toBe(ConsentStatuses.OptedOut);
    expect(body.data[1].consentStatement.version).toBe(consentStatementVersion);
    expect(body.data[2].status).toBe(ConsentStatuses.OptedIn);
    expect(body.data[2].consentStatement.version).toBe(consentStatementVersion);
    expect(
      body.data.every((c: { profileId: string }) => c.profileId === profileId),
    ).toBe(true);

    // Test cascade data fields are present with default null values
    for (const consent of body.data) {
      expect(consent).toHaveProperty("cascadeReason");
      expect(consent).toHaveProperty("cascadeSourceProfileId");
      expect(consent).toHaveProperty("sourceProfileEmail");
      expect(consent).toHaveProperty("targetProfileEmail");
      // For regular consents without cascade, these should be null except targetProfileEmail
      expect(consent.cascadeReason).toBeNull();
      expect(consent.cascadeSourceProfileId).toBeNull();
      expect(consent.sourceProfileEmail).toBeNull();
      expect(consent.targetProfileEmail).not.toBeNull(); // Should have the target profile email
    }

    // Validate cascade fields are present with expected default values
    for (const consent of body.data) {
      expect(consent).toHaveProperty("cascadeReason");
      expect(consent).toHaveProperty("cascadeSourceProfileId");
      expect(consent).toHaveProperty("sourceProfileEmail");
      expect(consent).toHaveProperty("targetProfileEmail");
      expect(consent.cascadeReason).toBeNull();
      expect(consent.cascadeSourceProfileId).toBeNull();
      expect(consent.sourceProfileEmail).toBeNull();
      expect(consent.targetProfileEmail).not.toBeNull(); // Should have the target profile email
    }
  });

  it("returns consents with cascade information when available", async () => {
    // Create a source profile that will be the cascade source
    const sourceProfileId = await createProfileWithConsent({
      profileId: "casc-src-123",
      consentStatus: ConsentStatuses.OptedIn,
      consentCreatedAt: new Date(Date.now() - 4000),
      organisationId,
      subject,
    });

    // Create a target profile with cascaded consent
    const targetProfileId = await createProfileWithConsent({
      profileId: "casc-tgt-123",
      consentStatus: ConsentStatuses.OptedIn,
      consentCreatedAt: new Date(Date.now() - 2000),
      organisationId,
      subject,
      cascadeReason: CascadeConsentReasons.AccountLinking,
      cascadeSourceProfileId: sourceProfileId,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consents",
      query: { subject, profileId: targetProfileId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { data: ConsentWithStatement[] };
    expect(body.data.length).toBe(1);

    const cascadedConsent = body.data[0];
    expect(cascadedConsent.cascadeReason).toBe(
      CascadeConsentReasons.AccountLinking,
    );
    expect(cascadedConsent.cascadeSourceProfileId).toBe(sourceProfileId);
    expect(cascadedConsent.sourceProfileEmail).toBe("casc-src-123@mail.com");
    expect(cascadedConsent.targetProfileEmail).toBe("casc-tgt-123@mail.com");
    expect(cascadedConsent.profileId).toBe(targetProfileId);
    expect(cascadedConsent.status).toBe(ConsentStatuses.OptedIn);
  });

  it("returns paginated results", async () => {
    const pagProfileId = await createProfileWithConsent({
      profileId: "pag-cons-1",
      consentStatus: ConsentStatuses.OptedIn,
      consentCreatedAt: new Date(Date.now() - 3000),
      organisationId,
      subject,
    });
    for (let i = 0; i < 4; i++) {
      await pool.query(
        `INSERT INTO profile_consents (profile_id, subject, status, created_at, consent_statement_id)
				 VALUES ($1, $2, $3, $4, $5)`,
        [
          pagProfileId,
          subject,
          ConsentStatuses.OptedOut,
          new Date(Date.now() - i * 1000),
          consentStatementId,
        ],
      );
    }

    await pool.query(
      `INSERT INTO profile_consents (profile_id, subject, status, created_at, consent_statement_id)
				 VALUES ($1, $2, $3, $4, $5)`,
      [
        pagProfileId,
        // another subject, this must not be taken
        // into account
        randomUUID().substring(0, 12),
        ConsentStatuses.OptedOut,
        new Date(),
        consentStatementId,
      ],
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consents",
      query: { subject, profileId: pagProfileId, limit: "2", offset: "0" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(2);
    expect(body.metadata.totalCount).toBe(5);
  });

  it("returns only consents for the requested profile and subject", async () => {
    // Insert a consent for a different profile (should not be returned)
    await createProfileWithConsent({
      profileId: "other-cons-1",
      consentStatus: ConsentStatuses.OptedIn,
      consentCreatedAt: new Date(),
      organisationId,
      subject: "other-subject-list",
    });
    const profileId = await createProfileWithConsent({
      profileId: "only-cons-1",
      consentStatus: ConsentStatuses.OptedOut,
      consentCreatedAt: new Date(),
      organisationId,
      subject,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consents",
      query: { subject, profileId },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(
      body.data.every((c: { profileId: string }) => c.profileId === profileId),
    ).toBe(true);
    expect(
      body.data.every((c: { subject: string }) => c.subject === subject),
    ).toBe(true);
  });

  const getServer = async () => {
    app = await build();

    app.addHook("onRequest", async (req: FastifyRequest) => {
      app.checkPermissions = async (
        request: FastifyRequest,
        _reply: FastifyReply,
        _permissions: string[],
        _matchConfig?: { method: "AND" | "OR" },
      ) => {
        req.userData = {
          userId: randomUUID(),
          accessToken: "accessToken",
          organizationId: organisationId,
          isM2MApplication: false,
        };

        request.userData = req.userData;
      };
    });

    return app;
  };
});
