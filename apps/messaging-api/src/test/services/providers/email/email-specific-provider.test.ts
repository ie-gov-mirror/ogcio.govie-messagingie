import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EnvConfig } from "../../../../plugins/external/env.js";
import { EmailSpecificProvider } from "../../../../services/providers/email/email-specific-provider.js";
import type {
  EmailCreateBody,
  ProviderUpdateBody,
} from "../../../../types/providers.js";
import CryptographyService from "../../../../utils/cryptography-service.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../../../build-testcontainer-pg.js";

const getMockToCreate = (primary = true): EmailCreateBody => ({
  providerName: `Pname${randomUUID().substring(0, 5)}`,
  isPrimary: primary,
  type: "email",
  smtpHost: `${randomUUID().substring(0, 5)}.smtp.com`,
  smtpPort: 1234,
  username: randomUUID().substring(0, 8),
  password: randomUUID().substring(0, 10),
  throttle: 1000,
  fromAddress: `${randomUUID().substring(0, 5)}@email.com`,
  ssl: true,
  headers: null,
});

const getCryptographyService = () =>
  new CryptographyService(process.env as unknown as EnvConfig);

describe("Email Specific Provider", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("should create provider", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const got = await specificProvider.get({ providerId: createdId });

    expect(got).toStrictEqual({ ...mockProvider, id: createdId });
  });

  it("should create provider with tenant", async () => {
    const mockProvider = getMockToCreate();
    mockProvider.headers = { "X-TEST-HEADER": "tenant-1" };

    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const got = await specificProvider.get({ providerId: createdId });

    expect(got).toStrictEqual({ ...mockProvider, id: createdId });
  });

  it("should not get provider for another org", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });
    const anotherProvider = new EmailSpecificProvider(
      pool,
      "org-ANOTHER",
      getCryptographyService(),
    );

    await expect(
      anotherProvider.get({ providerId: createdId }),
    ).rejects.toThrowError("failed to find email provider");
  });

  it("should update provider", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });
    const updateWith = getMockToCreate();

    await specificProvider.update({
      inputBody: { ...updateWith, id: createdId },
    });

    const got = await specificProvider.get({ providerId: createdId });

    expect(got).toStrictEqual({ ...updateWith, id: createdId });
  });

  it("should delete provider without decrypting its password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    await pool.query("UPDATE email_providers SET pw = 'legacy' WHERE id = $1", [
      createdId,
    ]);

    await specificProvider.delete({ providerId: createdId });

    await expect(
      specificProvider.get({ providerId: createdId }),
    ).rejects.toThrow("failed to find email provider");

    const deletedResult = await pool.query(
      `SELECT provider_name, from_address FROM email_providers WHERE id = $1 AND organisation_id = $2`,
      [createdId, "org-123"],
    );

    expect(deletedResult.rowCount).toBe(1);
    const deletedRow = deletedResult.rows[0];
    expect(deletedRow.provider_name).toMatch(/deleted-\d+-/);
    expect(deletedRow.from_address).toMatch(/deleted-\d+-/);
  });

  it("should list providers with pagination", async () => {
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-multiple",
      getCryptographyService(),
    );
    const toCreate = [
      getMockToCreate(),
      getMockToCreate(false),
      getMockToCreate(false),
      getMockToCreate(false),
    ];
    const createdPromises: Promise<string>[] = toCreate.map((p) =>
      specificProvider.create({ inputBody: p }),
    );
    const created = (await Promise.all(createdPromises)).sort();

    const listedAll = await specificProvider.list({
      isPrimary: undefined,
      pagination: { offset: "0", limit: "100" },
    });

    expect(listedAll.data.length).toBe(created.length);
    expect(listedAll.totalCount).toBe(created.length);
    expect(listedAll.data.map((l) => l.id).sort()).toStrictEqual(created);

    const listedFirstPart = await specificProvider.list({
      isPrimary: undefined,
      pagination: { offset: "0", limit: "2" },
    });

    expect(listedFirstPart.data.length).toBe(2);
    expect(listedFirstPart.totalCount).toBe(created.length);
    expect(listedFirstPart.data.map((l) => l.id)).toStrictEqual([
      listedAll.data[0].id,
      listedAll.data[1].id,
    ]);

    const listedSecondPart = await specificProvider.list({
      isPrimary: undefined,
      pagination: { offset: "2", limit: "2" },
    });

    expect(listedSecondPart.data.length).toBe(2);
    expect(listedSecondPart.totalCount).toBe(created.length);
    expect(listedSecondPart.data.map((l) => l.id)).toStrictEqual([
      listedAll.data[2].id,
      listedAll.data[3].id,
    ]);

    const listedOverflow = await specificProvider.list({
      isPrimary: undefined,
      pagination: { offset: "4", limit: "2" },
    });

    expect(listedOverflow.data.length).toBe(0);
    expect(listedOverflow.totalCount).toBe(created.length);
  });

  it("should list providers with primary or non primary", async () => {
    const specificProvider = new EmailSpecificProvider(
      pool,
      `org-${randomUUID().substring(0, 5)}`,
      getCryptographyService(),
    );
    const primary = await specificProvider.create({
      inputBody: getMockToCreate(),
    });
    const toCreate = [
      getMockToCreate(false),
      getMockToCreate(false),
      getMockToCreate(false),
    ];
    const createdPromises: Promise<string>[] = toCreate.map((p) =>
      specificProvider.create({ inputBody: p }),
    );
    const created = (await Promise.all(createdPromises)).sort();

    const listedPrimary = await specificProvider.list({
      isPrimary: true,
      pagination: { offset: "0", limit: "100" },
    });

    expect(listedPrimary.data.length).toBe(1);
    expect(listedPrimary.totalCount).toBe(1);
    expect(listedPrimary.data[0].id).toStrictEqual(primary);

    const listedNonPrimary = await specificProvider.list({
      isPrimary: false,
      pagination: { offset: "0", limit: "100" },
    });

    expect(listedNonPrimary.data.length).toBe(3);
    expect(listedNonPrimary.totalCount).toBe(3);
    expect(listedNonPrimary.data.map((d) => d.id).sort()).toStrictEqual(
      created,
    );
  });

  it("should create provider as primary", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-prim",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const got = await specificProvider.get({ providerId: createdId });

    expect(got.isPrimary).toStrictEqual(true);

    const second = getMockToCreate();
    const secondId = await specificProvider.create({
      inputBody: second,
    });

    // if a second provider is created as primary, the old one
    // must be set as non primary
    const firstAfterSecond = await specificProvider.get({
      providerId: createdId,
    });
    const secondCreated = await specificProvider.get({ providerId: secondId });

    expect(firstAfterSecond.isPrimary).toStrictEqual(false);
    expect(secondCreated.isPrimary).toStrictEqual(true);
  });

  it("should update provider as primary", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-upd",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const got = await specificProvider.get({ providerId: createdId });
    expect(got.isPrimary).toStrictEqual(true);

    const second = getMockToCreate(false);
    const secondId = await specificProvider.create({
      inputBody: second,
    });

    // if a second provider is created as non-primary, the old one
    // must be remain the primary
    const firstAfterSecondCreation = await specificProvider.get({
      providerId: createdId,
    });
    const secondCreated = await specificProvider.get({ providerId: secondId });

    expect(firstAfterSecondCreation.isPrimary).toStrictEqual(true);
    expect(secondCreated.isPrimary).toStrictEqual(false);

    await specificProvider.update({
      inputBody: { ...second, isPrimary: true, id: secondId },
    });

    // if the second provider is updated as primary, the old one
    // must be set as non-primary
    const firstAfterUpdate = await specificProvider.get({
      providerId: createdId,
    });
    const secondUpdated = await specificProvider.get({ providerId: secondId });

    expect(firstAfterUpdate.isPrimary).toStrictEqual(false);
    expect(secondUpdated.isPrimary).toStrictEqual(true);
  });

  it("primary provider for another org must remain the same", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-prim-1",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });
    const anotherProvider = new EmailSpecificProvider(
      pool,
      "org-prim-2",
      getCryptographyService(),
    );
    const anotherCreatedId = await anotherProvider.create({
      inputBody: mockProvider,
    });
    const createdGot = await specificProvider.get({ providerId: createdId });
    const anotherCreatedGot = await anotherProvider.get({
      providerId: anotherCreatedId,
    });

    expect(createdGot.isPrimary).toBe(true);
    expect(anotherCreatedGot.isPrimary).toBe(true);
  });

  it("get primary works fine", async () => {
    const mockProvider = getMockToCreate();
    mockProvider.headers = { "X-TEST-HEADER": "org-primary" };
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-primary",
      getCryptographyService(),
    );
    await specificProvider.create({
      inputBody: getMockToCreate(false),
    });
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const primary = await specificProvider.getPrimaryOrDefault();

    expect(primary.id).toStrictEqual(createdId);
    expect(primary.isPrimary).toBe(true);
    expect(primary.headers).toStrictEqual({ "X-TEST-HEADER": "org-primary" });
  });

  it("get without setting includePassword returns password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-primary",
      getCryptographyService(),
    );
    await specificProvider.create({
      inputBody: getMockToCreate(false),
    });
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const primary = await specificProvider.get({ providerId: createdId });

    expect(primary.id).toStrictEqual(createdId);
    expect(primary.password).toBe(mockProvider.password);
  });

  it("get with includePassword to true returns password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-primary",
      getCryptographyService(),
    );
    await specificProvider.create({
      inputBody: getMockToCreate(false),
    });
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const primary = await specificProvider.get({
      providerId: createdId,
      includePassword: true,
    });

    expect(primary.id).toStrictEqual(createdId);
    expect(primary.password).toBe(mockProvider.password);
  });

  it("get with includePassword to false omits password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-primary",
      getCryptographyService(),
    );
    await specificProvider.create({
      inputBody: getMockToCreate(false),
    });
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const primary = (await specificProvider.get({
      providerId: createdId,
      includePassword: false,
    })) as Record<string, unknown>;

    expect(primary.id).toStrictEqual(createdId);
    expect(primary.password).toBeUndefined();
  });

  it("should update provider with empty password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });
    const updateWith = getMockToCreate();
    updateWith.password = "";
    await specificProvider.update({
      inputBody: { ...updateWith, id: createdId },
    });

    const got = await specificProvider.get({ providerId: createdId });

    // original password must be maintained
    expect(got.password).toStrictEqual(mockProvider.password);
  });

  it("should update provider with null password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const updateWith = getMockToCreate() as ProviderUpdateBody;
    updateWith.password = null;

    await specificProvider.update({
      inputBody: { ...updateWith, id: createdId },
    });

    const got = await specificProvider.get({ providerId: createdId });

    // original password must be maintained
    expect(got.password).toStrictEqual(mockProvider.password);
  });

  it("should update provider with undefined password", async () => {
    const mockProvider = getMockToCreate();
    const specificProvider = new EmailSpecificProvider(
      pool,
      "org-123",
      getCryptographyService(),
    );
    const createdId = await specificProvider.create({
      inputBody: mockProvider,
    });

    const updateWith = getMockToCreate() as ProviderUpdateBody;
    delete updateWith.password;

    await specificProvider.update({
      inputBody: { ...updateWith, id: createdId },
    });

    const got = await specificProvider.get({ providerId: createdId });

    // original password must be maintained
    expect(got.password).toStrictEqual(mockProvider.password);
  });
});
