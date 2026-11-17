import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { utils } from "../../utils/utils.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../build-testcontainer-pg.js";
import { build } from "../test-server-builder.js";

describe("POST /api/v1/support/messages/search", {}, () => {
  const organizationIdFirstSender = randomUUID().substring(0, 10);
  const organizationIdSecondSender = randomUUID().substring(0, 11);
  const recipientIdA = randomUUID().substring(0, 12);
  const recipientIdB = randomUUID().substring(0, 12);
  let pool: Pool;

  beforeAll(async () => {
    pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
    await Promise.all([
      insertMessage(recipientIdA, organizationIdFirstSender, pool),
      insertMessage(recipientIdA, organizationIdSecondSender, pool),
      insertMessage(recipientIdB, organizationIdFirstSender, pool),
    ]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  let app: FastifyInstance | undefined;

  afterEach(() => {
    if (app) {
      app.close();
      app = undefined;
    }
  });

  it("should return 403 if a public servant is logged in", async () => {
    app = await getServer(randomUUID().substring(0, 12), "pub-ser", false);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: [recipientIdA],
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return 403 if the caller is not an M2M application", async () => {
    app = await getServer(randomUUID().substring(0, 12), undefined, false);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: [recipientIdA],
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return all messages for a single recipient", async () => {
    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: [recipientIdA],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(2);
  });

  it("should return messages for multiple recipients", async () => {
    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: [recipientIdA, recipientIdB],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(3);
  });

  it("should return no messages for unknown recipients", async () => {
    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: ["unknown-user"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(0);
  });

  it("should return messages with optional fields set to null", async () => {
    const nullRecipientId = "null-supp";
    await insertMessage(nullRecipientId, "an-org", pool, true);

    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: [nullRecipientId],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
    expect(body[0].threadName).toBeNull();
  });

  it("should not return soft-deleted messages by default", async () => {
    const delRecipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    const activeId = await insertMessage(delRecipientId, orgId, pool);
    const deletedId = await insertMessage(delRecipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedId,
    ]);

    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: {
        recipientUserIds: [delRecipientId],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    const ids = body.map((m: { id: string }) => m.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(deletedId);
  });

  it("should return only soft-deleted messages when deleted=true", async () => {
    const delRecipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    const activeId = await insertMessage(delRecipientId, orgId, pool);
    const deletedId = await insertMessage(delRecipientId, orgId, pool);
    const olderThanDaysId = await insertMessage(delRecipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedId,
    ]);
    await pool.query(
      "UPDATE messages SET deleted_at = now() - interval '31 days' WHERE id = $1",
      [olderThanDaysId],
    );

    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      query: {
        deletedAfterDateTime: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      payload: {
        recipientUserIds: [delRecipientId],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    const ids = body.map((m: { id: string }) => m.id);
    expect(ids).toContain(deletedId);
    expect(ids).not.toContain(activeId);
    expect(ids).not.toContain(olderThanDaysId);
  });

  it("should not return an erased message that is still in the inbox", async () => {
    const recipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    const liveId = await insertMessage(recipientId, orgId, pool);
    const erasedId = await insertMessage(recipientId, orgId, pool);
    await pool.query("UPDATE messages SET erased_at = now() WHERE id = $1", [
      erasedId,
    ]);

    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      payload: { recipientUserIds: [recipientId] },
    });

    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((m: { id: string }) => m.id);
    expect(ids).toContain(liveId);
    expect(ids).not.toContain(erasedId);
  });

  it("should not return an erased message, even when listing deleted ones", async () => {
    const recipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    const deletedId = await insertMessage(recipientId, orgId, pool);
    const erasedId = await insertMessage(recipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedId,
    ]);
    await pool.query(
      "UPDATE messages SET deleted_at = now(), erased_at = now() WHERE id = $1",
      [erasedId],
    );

    app = await getServer(randomUUID().substring(0, 12), undefined, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/support/messages/search",
      query: {
        deletedAfterDateTime: new Date(
          Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      payload: { recipientUserIds: [recipientId] },
    });

    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((m: { id: string }) => m.id);
    expect(ids).toContain(deletedId);
    expect(ids).not.toContain(erasedId);
  });
});

async function getServer(
  userId: string,
  organizationId: string | undefined,
  isM2MApplication: boolean,
): Promise<FastifyInstance> {
  const server = await build();
  server.decorate("checkPermissionsCount", 0);
  server.addHook("onRequest", async (req: FastifyRequest) => {
    server.checkPermissions = async (
      request: FastifyRequest,
      _reply: FastifyReply,
      _permissions: string[],
      _matchConfig?: { method: "AND" | "OR" },
    ) => {
      req.userData = {
        userId,
        accessToken: "accesstoken",
        organizationId,
        isM2MApplication,
      };
      request.userData = req.userData;
    };
  });

  return server;
}

async function insertMessage(
  recipientProfileId: string,
  organisationId: string,
  pool: Pool,
  setNullOptionalFields?: boolean,
): Promise<string> {
  let [excerpt, richText, threadName]: (string | null)[] = [
    "exc",
    "rich",
    "thread",
  ];
  if (setNullOptionalFields === true) {
    [excerpt, richText, threadName] = [null, null, null];
  }
  const qres = await pool.query(
    `
    insert into messages(
      is_delivered,
      user_id,
      subject,
      excerpt,
      plain_text,
      rich_text,
      security_level,
      lang,
      preferred_transports,
      thread_name,
      organisation_id,
      scheduled_at,
      is_seen)
    values(
      true,
      $1,
      's',
      $4,
      'pt',
      $5,
      'public',
      'en',
      $2,
      $6,
      $3,
      now(),
      true)
    returning id
  `,
    [
      recipientProfileId,
      utils.postgresArrayify([""]),
      organisationId,
      excerpt,
      richText,
      threadName,
    ],
  );
  return qres.rows[0].id as string;
}
