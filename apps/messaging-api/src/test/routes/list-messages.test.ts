import { randomUUID } from "node:crypto";
import { createDb, type Kysely } from "@ogcio/db-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DB } from "../../db/schema.js";
import { MessageModel } from "../../models/message-model.js";
import { Permissions } from "../../types/permissions.js";
import { utils } from "../../utils/utils.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../build-testcontainer-pg.js";
import { build } from "../test-server-builder.js";

// Please note
// This test file only contains the test cases
// that do not make use of the ProfileSDKWrapper
// to avoid building complex logics to
// mock it through another server.
// that code will be tested in the services folder

describe("GET /api/v1/messages", {}, () => {
  const organizationIdFirstSender = randomUUID().substring(0, 10);
  const organizationIdSecondSender = randomUUID().substring(0, 11);
  const recipientId = randomUUID().substring(0, 12);
  let pool: Pool;

  beforeAll(async () => {
    pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
    await Promise.all([
      insertMessage(recipientId, organizationIdFirstSender, pool),
      insertMessage(recipientId, organizationIdSecondSender, pool),
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

  it("should return 403 is public servant is logged in", async () => {
    app = await getServer(randomUUID().substring(0, 12), "pub-ser");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return all messages for the recipient user", async () => {
    app = await getServer(recipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: recipientId,
        status: "delivered",
        isSeen: "true",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(2);
  });

  it("should return only messages for a specific org for a user", async () => {
    app = await getServer(recipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: recipientId,
        organisationId: organizationIdFirstSender,
        status: "delivered",
        isSeen: "true",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
  });

  it("should return no messages for an org that not sent messages", async () => {
    app = await getServer(recipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: recipientId,
        organisationId: "another",
        status: "delivered",
        isSeen: "true",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(0);
  });

  it("should return messages with optional fields set to null", async () => {
    const nullRecipientId = "null-id";
    app = await getServer(nullRecipientId, undefined);
    await insertMessage(nullRecipientId, "an-org", pool, true);

    app = await getServer(nullRecipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: nullRecipientId,
        status: "delivered",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
    expect(body[0].threadName).toBeNull();
  });

  it("should expose isSeen on each list item so the inbox can render read state", async () => {
    // The list endpoint historically omitted `isSeen` from its response, which
    // forced the unified inbox UI to treat every row as unread (because
    // `!undefined` is truthy). The mark-as-read PUT was working server-side
    // but the next list refetch couldn't surface the state change. AB#37868.
    const seenRecipientId = `seen-${randomUUID().substring(0, 6)}`;
    const orgId = randomUUID().substring(0, 12);
    const seenMsg = await insertMessage(seenRecipientId, orgId, pool); // is_seen=true
    await pool.query("UPDATE messages SET is_seen = false WHERE id = $1", [
      seenMsg.id,
    ]);
    const unseenMsgId = seenMsg.id;
    const seenAgain = await insertMessage(seenRecipientId, orgId, pool); // is_seen=true

    app = await getServer(seenRecipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: seenRecipientId,
        status: "delivered",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data as Array<{ id: string; isSeen: boolean }>;
    expect(body).toHaveLength(2);
    for (const item of body) {
      expect(item).toHaveProperty("isSeen");
      expect(typeof item.isSeen).toBe("boolean");
    }
    const byId = Object.fromEntries(body.map((m) => [m.id, m.isSeen]));
    expect(byId[unseenMsgId]).toBe(false);
    expect(byId[seenAgain.id]).toBe(true);
  });

  it("should not return soft-deleted messages by default", async () => {
    const delRecipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    await insertMessage(delRecipientId, orgId, pool);
    const deletedMsg = await insertMessage(delRecipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedMsg.id,
    ]);

    app = await getServer(delRecipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: delRecipientId,
        organisationId: orgId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
    expect(body[0].id).not.toBe(deletedMsg.id);
  });

  it("should return only soft-deleted messages when deleted=true", async () => {
    const delRecipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    await insertMessage(delRecipientId, orgId, pool);
    const deletedMsg = await insertMessage(delRecipientId, orgId, pool);
    const deletedAf = await insertMessage(delRecipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedMsg.id,
    ]);
    await pool.query(
      "UPDATE messages SET deleted_at = now() - interval '30 day' WHERE id = $1",
      [deletedAf.id],
    );

    app = await getServer(delRecipientId, undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      query: {
        recipientUserId: delRecipientId,
        organisationId: orgId,
        deletedAfterDateTime: new Date(
          Date.now() - 15 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 15 days ago
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(deletedMsg.id);
  });
});

describe("POST /api/v1/messages/search", {}, () => {
  const organizationIdFirstSender = randomUUID().substring(0, 10);
  const organizationIdSecondSender = randomUUID().substring(0, 11);
  const recipientId = randomUUID().substring(0, 12);
  let pool: Pool;

  beforeAll(async () => {
    pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
    await Promise.all([
      insertMessage(recipientId, organizationIdFirstSender, pool),
      insertMessage(recipientId, organizationIdSecondSender, pool),
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

  it("should return 403 is public servant is logged in", async () => {
    app = await getServer(randomUUID().substring(0, 12), "pub-ser");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/search",
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return all messages for the recipient user", async () => {
    app = await getServer(recipientId, undefined);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/search",
      payload: {
        recipientUserId: recipientId,
        status: "delivered",
        isSeen: "true",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(2);
  });

  it("should return only messages for a specific org for a user", async () => {
    app = await getServer(recipientId, undefined);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/search",
      payload: {
        recipientUserId: recipientId,
        organisationId: organizationIdFirstSender,
        status: "delivered",
        isSeen: "true",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
  });

  it("should return no messages for an org that not sent messages", async () => {
    app = await getServer(recipientId, undefined);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/search",
      payload: {
        recipientUserId: recipientId,
        organisationId: "another",
        status: "delivered",
        isSeen: "true",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(0);
  });

  it("should not return soft-deleted messages by default via search", async () => {
    const delRecipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    await insertMessage(delRecipientId, orgId, pool);
    const deletedMsg = await insertMessage(delRecipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedMsg.id,
    ]);

    app = await getServer(delRecipientId, undefined);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/search",
      payload: {
        recipientUserId: delRecipientId,
        organisationId: orgId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
    expect(body[0].id).not.toBe(deletedMsg.id);
  });

  it("should return only soft-deleted messages when deleted=true via search", async () => {
    const delRecipientId = randomUUID().substring(0, 12);
    const orgId = randomUUID().substring(0, 10);
    await insertMessage(delRecipientId, orgId, pool);
    const deletedMsg = await insertMessage(delRecipientId, orgId, pool);
    const deletedAf = await insertMessage(delRecipientId, orgId, pool);
    await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
      deletedMsg.id,
    ]);
    await pool.query(
      "UPDATE messages SET deleted_at = now() - interval '30 day' WHERE id = $1",
      [deletedAf.id],
    );

    app = await getServer(delRecipientId, undefined);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages/search",
      payload: {
        recipientUserId: delRecipientId,
        organisationId: orgId,
        deletedAfterDateTime: new Date(
          Date.now() - 15 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 15 days ago
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(deletedMsg.id);
  });
});

// The inbox tag-folder filter (`tagId` / `untagged`) is enforced in
// MessageModel.listForInbox. The route/service reject `untagged` and `tagId`
// together, so the model is exercised directly here to also pin the precedence
// of `untagged` over `tagId`.
describe("MessageModel.listForInbox tag filtering", () => {
  let pool: Pool;
  let db: Kysely<DB>;
  let model: MessageModel;
  const recipientId = randomUUID().substring(0, 12);
  const orgId = randomUUID().substring(0, 10);
  let taggedId: string;
  let untaggedId: string;
  let tagId: string;

  beforeAll(async () => {
    const connectionString = process.env[DATABASE_TEST_URL_KEY];
    pool = getPoolFromConnectionString(connectionString);
    db = createDb<DB>({ connectionString });
    model = new MessageModel(db);

    taggedId = (await insertMessage(recipientId, orgId, pool)).id;
    untaggedId = (await insertMessage(recipientId, orgId, pool)).id;

    const tagRes = await pool.query<{ id: string }>(
      `INSERT INTO tags(user_id, label, path) VALUES($1, 'InboxTag', replace(gen_random_uuid()::text, '-', '')::ltree) RETURNING id`,
      [recipientId],
    );
    tagId = tagRes.rows[0].id;
    await pool.query(`UPDATE messages SET tag_id = $1 WHERE id = $2`, [
      tagId,
      taggedId,
    ]);
  });

  afterAll(async () => {
    await db?.destroy();
    if (pool) {
      await pool.end();
    }
  });

  const listWith = (query: { tagId?: string; untagged?: boolean }) =>
    model.listForInbox({
      recipientUserIds: [recipientId],
      organizationId: orgId,
      pagination: { limit: "20", offset: "0" },
      query: {
        isSeen: undefined,
        search: undefined,
        deletedAfterDateTime: undefined,
        tagId: query.tagId,
        untagged: query.untagged,
      },
    });

  it("returns only tagged messages when filtering by tagId", async () => {
    const result = await listWith({ tagId });
    expect(result.totalCount).toBe(1);
    expect(result.data.map((d) => d.id)).toEqual([taggedId]);
  });

  it("returns only untagged messages when untagged=true", async () => {
    const result = await listWith({ untagged: true });
    expect(result.totalCount).toBe(1);
    expect(result.data.map((d) => d.id)).toEqual([untaggedId]);
  });

  it("returns both messages when neither tag filter is set", async () => {
    const result = await listWith({});
    expect(result.data.map((d) => d.id).sort()).toEqual(
      [taggedId, untaggedId].sort(),
    );
  });

  it("gives untagged precedence over tagId when both are set", async () => {
    const result = await listWith({ tagId, untagged: true });
    expect(result.totalCount).toBe(1);
    expect(result.data.map((d) => d.id)).toEqual([untaggedId]);
  });
});

async function getServer(
  userId: string,
  organizationId: string | undefined,
): Promise<FastifyInstance> {
  const server = await build();
  server.decorate("checkPermissionsCount", 0);
  server.addHook("onRequest", async (req: FastifyRequest) => {
    // Override the request decorator
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
        isM2MApplication: false,
        scopes: [Permissions.MessageSelf.Read, Permissions.OnboardedCitizen],
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
) {
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
      returning id, 
        created_at as createdAt,
        excerpt,
        organisation_id as organisationId,
        plain_text as plainText,
        user_id as recipientUserId,
        rich_text as richText,
        security_level as security,
        subject,
        thread_name as threadName,
        is_seen as isSeen,
        is_delivered as isDelivered
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
  const result = qres.rows[0];
  return {
    attachments: [],
    ...result,
  };
}
