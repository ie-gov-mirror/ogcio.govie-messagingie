import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConsentStatement } from "~/schemas/consent-statements/shared.js";
import { createProfile } from "~/services/profiles/sql/create-profile.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "~/test/build-testcontainer-pg.js";
import { insertTestConsentStatement } from "~/test/insert-test-consent-statement.js";
import { buildOnce, type MockAuthConfig } from "~/test/test-server-builder.js";

const pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);

describe("GET - /api/v1/organisations/consent-statements", async () => {
  let app: FastifyInstance;
  let setAuth: (config: MockAuthConfig) => void;
  const loggedInUserId = randomUUID().substring(0, 12);
  const usedSubjects: string[] = [];

  beforeAll(async () => {
    const server = await buildOnce();
    app = server.app;
    setAuth = server.setAuth;

    const client = await pool.connect();
    // Need to create profile because of the created_by constraint in
    // consent_statement table
    await createProfile(client, {
      email: `${randomUUID()}@example.com`,
      publicName: "User",
      primaryUserId: loggedInUserId,
      id: loggedInUserId,
    });
    client.release();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("Returns empty array if no statements for subject are available", async () => {
    setAuth({ userId: loggedInUserId, organizationId: "organisationId" });
    const randomSubject = randomUUID().substring(0, 10);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(0);
    expect(body.metadata.totalCount).toBe(0);
  });

  it("Returns the expected consent statement schema", async () => {
    const randomSubject = randomUUID().substring(0, 11);

    const version = Math.floor(Math.random() * 1000);
    const publishDate = new Date(Date.now() + 100000);
    const isEnabled = Math.random() < 0.5;
    const { id } = await insertTestConsentStatement(pool, {
      subject: randomSubject,
      version,
      publishDate,
      createdBy: loggedInUserId,
      isEnabled,
    });

    usedSubjects.push(randomSubject);

    setAuth({ userId: loggedInUserId, organizationId: "organisationId" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      data: ConsentStatement[];
      metadata: { totalCount: number };
    };
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(id);
    expect(body.data[0].subject).toBe(randomSubject);
    expect(body.data[0].version).toBe(version);
    expect(body.data[0].publishDate).toStrictEqual(publishDate.toISOString());
    expect(body.data[0].createdBy).toBe(loggedInUserId);
    expect(body.data[0].isEnabled).toBe(isEnabled);
    expect(body.data[0].createdAt).toBeDefined();
    expect(body.metadata.totalCount).toBe(1);
  });

  it("Returns both enabled/disabled and past/future if not filtered, sorted by publish date desc", async () => {
    setAuth({ userId: loggedInUserId, organizationId: "organisationId" });
    const randomSubject = randomUUID().substring(0, 10);
    const version = 1;
    const { id: enabledId } = await insertTestConsentStatement(pool, {
      subject: randomSubject,
      isEnabled: true,
      version,
      // newer, in the future
      publishDate: new Date(Date.now() + 100000),
    });
    const { id: disabledId } = await insertTestConsentStatement(pool, {
      subject: randomSubject,
      isEnabled: false,
      version: version + 1,
      // older, in the past
      publishDate: new Date(Date.now() - 2000),
    });

    usedSubjects.push(randomSubject);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(2);
    expect(body.data[0].id).toBe(enabledId);
    expect(body.data[1].id).toBe(disabledId);
    expect(body.metadata.totalCount).toBe(2);
  });

  it("Returns for multiple subjects if not filtered", async () => {
    setAuth({ userId: loggedInUserId, organizationId: "organisationId" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { limit: "100" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    // At this point we inserted 3 consent statements
    // but we also have to take into accounts subjects from other tests
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(body.metadata.totalCount).toBeGreaterThanOrEqual(3);

    const mappedSubjects = body.data.map(
      (item: { subject: string }) => item.subject,
    );

    for (const usedSubject of usedSubjects) {
      expect(mappedSubjects).toContain(usedSubject);
    }
  });

  it("Filter for enabled and disabled as expected", async () => {
    setAuth({ userId: loggedInUserId, organizationId: "organisationId" });
    const randomSubject = randomUUID().substring(0, 10);
    const version = 1;
    // Enabled one
    const { id: enabledId } = await insertTestConsentStatement(pool, {
      subject: randomSubject,
      isEnabled: true,
      version,
      // newer, in the future
      publishDate: new Date(Date.now() + 100000),
    });
    // Disabled one
    const { id: disabledId } = await insertTestConsentStatement(pool, {
      subject: randomSubject,
      isEnabled: false,
      version: version + 1,
      // older, in the past
      publishDate: new Date(Date.now() - 2000),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, isEnabled: "true" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(enabledId);
    expect(body.metadata.totalCount).toBe(1);

    const disabledResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, isEnabled: "false" },
    });

    expect(disabledResponse.statusCode).toBe(200);
    const disabledBody = JSON.parse(disabledResponse.body);
    expect(disabledBody.data).toBeDefined();
    expect(disabledBody.data.length).toBe(1);
    expect(disabledBody.data[0].id).toBe(disabledId);
    expect(disabledBody.metadata.totalCount).toBe(1);
  });

  it("Pagination works as expected", async () => {
    setAuth({ userId: loggedInUserId, organizationId: "organisationId" });
    const randomSubject = randomUUID().substring(0, 10);
    // First one will be the newer one
    const negativeDifferenceFromNow = 20000;
    let version = 1;
    const insertedIds: string[] = [];
    const numberOfConsentStatements = 120;

    for (let csIndex = 0; csIndex < numberOfConsentStatements; csIndex++) {
      const { id } = await insertTestConsentStatement(pool, {
        subject: randomSubject,
        isEnabled: true,
        version: version++,
        publishDate: new Date(
          Date.now() - negativeDifferenceFromNow - csIndex * 1000,
        ),
      });
      insertedIds.push(id);
    }

    // Default pagination
    const defaultPagResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject },
    });

    expect(defaultPagResponse.statusCode).toBe(200);
    const defaultPagBody = JSON.parse(defaultPagResponse.body);
    expect(defaultPagBody.data).toBeDefined();
    // 20 is the default limit value
    expect(defaultPagBody.data.length).toBe(20);
    // Check sorting
    expect(defaultPagBody.data[0].id).toBe(insertedIds[0]);
    expect(defaultPagBody.data[1].id).toBe(insertedIds[1]);
    expect(defaultPagBody.data[18].id).toBe(insertedIds[18]);
    expect(defaultPagBody.metadata.totalCount).toBe(numberOfConsentStatements);

    // Higher limit
    const higherLimitResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, limit: "50" },
    });

    expect(higherLimitResponse.statusCode).toBe(200);
    const higherLimitBody = JSON.parse(higherLimitResponse.body);
    expect(higherLimitBody.data).toBeDefined();
    expect(higherLimitBody.data.length).toBe(50);
    expect(higherLimitBody.data[0].id).toBe(insertedIds[0]);
    expect(higherLimitBody.data[1].id).toBe(insertedIds[1]);
    expect(higherLimitBody.data[48].id).toBe(insertedIds[48]);
    expect(higherLimitBody.data[49].id).toBe(insertedIds[49]);
    expect(higherLimitBody.metadata.totalCount).toBe(numberOfConsentStatements);

    // Limit above the maximum is rejected
    const overflowLimitResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, limit: "200" },
    });

    expect(overflowLimitResponse.statusCode).toBe(422);
    expect(JSON.parse(overflowLimitResponse.body).detail).toBe(
      "Limit must be between 1 and 100",
    );

    // Smaller pages - First page
    const smallerPageResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, limit: "10" },
    });

    expect(smallerPageResponse.statusCode).toBe(200);
    const smallerPageBody = JSON.parse(smallerPageResponse.body);
    expect(smallerPageBody.data).toBeDefined();
    expect(smallerPageBody.data.length).toBe(10);
    expect(smallerPageBody.data[0].id).toBe(insertedIds[0]);
    expect(smallerPageBody.data[1].id).toBe(insertedIds[1]);
    expect(smallerPageBody.data[9].id).toBe(insertedIds[9]);
    expect(smallerPageBody.metadata.totalCount).toBe(numberOfConsentStatements);

    // Smaller pages - Second page
    const smallerSecondPage = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, limit: "10", offset: "10" },
    });

    expect(smallerSecondPage.statusCode).toBe(200);
    const smallerSecondBody = JSON.parse(smallerSecondPage.body);
    expect(smallerSecondBody.data).toBeDefined();
    expect(smallerSecondBody.data.length).toBe(10);
    expect(smallerSecondBody.data[0].id).toBe(insertedIds[10]);
    expect(smallerSecondBody.data[1].id).toBe(insertedIds[11]);
    expect(smallerSecondBody.data[9].id).toBe(insertedIds[19]);
    expect(smallerSecondBody.metadata.totalCount).toBe(
      numberOfConsentStatements,
    );

    // Smaller pages - Last page overflows
    const smallerLastPage = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: {
        subject: randomSubject,
        limit: "10",
        offset: (numberOfConsentStatements - 1).toString(),
      },
    });

    expect(smallerLastPage.statusCode).toBe(200);
    const smallerLastBody = JSON.parse(smallerLastPage.body);
    expect(smallerLastBody.data).toBeDefined();
    expect(smallerLastBody.data.length).toBe(1);
    expect(smallerLastBody.data[0].id).toBe(
      insertedIds[numberOfConsentStatements - 1],
    );
    expect(smallerLastBody.metadata.totalCount).toBe(numberOfConsentStatements);

    // Offset higher than total count
    const overflowOffsetResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: {
        subject: randomSubject,
        offset: (numberOfConsentStatements + 1).toString(),
      },
    });

    expect(overflowOffsetResponse.statusCode).toBe(200);
    const overflowOffsetBody = JSON.parse(overflowOffsetResponse.body);
    expect(overflowOffsetBody.data).toBeDefined();
    expect(overflowOffsetBody.data.length).toBe(0);
    expect(overflowOffsetBody.metadata.totalCount).toBe(
      numberOfConsentStatements,
    );

    // Negative limit
    const negativeLimitResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, limit: "-1" },
    });

    expect(negativeLimitResponse.statusCode).toBe(422);

    // Negative offset
    const negativeOffsetResponse = await app.inject({
      method: "GET",
      url: "/api/v1/organisations/consent-statements",
      query: { subject: randomSubject, limit: "10", offset: "-1" },
    });

    expect(negativeOffsetResponse.statusCode).toBe(422);
  });
});
