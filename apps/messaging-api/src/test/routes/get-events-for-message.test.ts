import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  MessagingEventLogger,
  MessagingEventType,
} from "../../services/messages/event-logger.js";
import { utils } from "../../utils/utils.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../build-testcontainer-pg.js";
import { build, getMockBaseLogger } from "../test-server-builder.js";

describe("GET /api/v1/messages/{messageId}/events", {}, () => {
  const organizationIdFirstSender = randomUUID().substring(0, 10);
  const organizationIdSecondSender = randomUUID().substring(0, 11);
  let firstMessage: InsertMessageSchema;
  let secondMessage: InsertMessageSchema;
  const recipientId = randomUUID().substring(0, 12);
  let pool: Pool;
  let messagingEventLogger: MessagingEventLogger;

  beforeAll(async () => {
    pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
    messagingEventLogger = new MessagingEventLogger(pool, getMockBaseLogger());
    [firstMessage, secondMessage] = await Promise.all([
      insertMessage(recipientId, organizationIdFirstSender, pool),
      insertMessage(recipientId, organizationIdSecondSender, pool),
    ]);

    messagingEventLogger.log(MessagingEventType.createRawMessage, {
      messageId: firstMessage.id,
      organisationName: firstMessage.organisationId,
      receiverFullName: firstMessage.recipientUserId,
    });
    messagingEventLogger.log(MessagingEventType.deliverMessage, {
      messageId: firstMessage.id,
    });
    await messagingEventLogger.commit();
    messagingEventLogger.log(MessagingEventType.createRawMessage, {
      messageId: secondMessage.id,
      organisationName: secondMessage.organisationId,
      receiverFullName: secondMessage.recipientUserId,
    });
    messagingEventLogger.log(MessagingEventType.deliverMessageError, {
      messageId: secondMessage.id,
    });
    await messagingEventLogger.commit();
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

  it("should return 403 if citizen is logged in", async () => {
    app = await getServer(randomUUID().substring(0, 12), undefined);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${firstMessage.id}/events`,
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return 404 if organization logged in is different from message one", async () => {
    app = await getServer(
      randomUUID().substring(0, 12),
      firstMessage.organisationId,
    );
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${secondMessage.id}/events`,
    });

    expect(res.statusCode).toBe(404);
  });

  it("should return events for message", async () => {
    app = await getServer(
      randomUUID().substring(0, 12),
      firstMessage.organisationId,
    );
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${firstMessage.id}/events`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body).toHaveLength(2);
    expect(body[0].messageId).toBe(firstMessage.id);
    expect(body[1].messageId).toBe(firstMessage.id);
    expect(body[0].eventType).toBe(MessagingEventType.deliverMessage.key);
    expect(body[1].eventType).toBe(MessagingEventType.createRawMessage.key);
  });

  it("should keep the reason and provider fields of email events", async () => {
    // Email outcomes carry their reason and provider ID in the event data
    const message = await insertMessage(
      recipientId,
      organizationIdFirstSender,
      pool,
    );
    messagingEventLogger.log(MessagingEventType.emailError, {
      messageId: message.id,
      messageKey: "failedToSend",
      details: "554 Message rejected",
    });
    messagingEventLogger.log(MessagingEventType.emailAccepted, {
      messageId: message.id,
      providerMessageId: "0102018f-ses-id",
    });
    await messagingEventLogger.commit();

    app = await getServer(
      randomUUID().substring(0, 12),
      message.organisationId,
    );
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${message.id}/events`,
    });

    expect(res.statusCode).toBe(200);
    const [accepted, failed] = res.json().data;
    expect(accepted.data).toEqual({
      messageId: message.id,
      providerMessageId: "0102018f-ses-id",
    });
    expect(failed.data).toEqual({
      messageId: message.id,
      messageKey: "failedToSend",
      details: "554 Message rejected",
    });
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
      };
      request.userData = req.userData;
    };
  });

  return server;
}

type InsertMessageSchema = {
  id: string;
  createdAt: string;
  excerpt: string | null;
  organisationId: string;
  plainText: string;
  recipientUserId: string;
  richText: string | null;
  security: string;
  subject: string;
  threadName: string | null;
  isSeen: boolean;
  isDelivered: boolean;
};

async function insertMessage(
  recipientProfileId: string,
  organisationId: string,
  pool: Pool,
  setNullOptionalFields?: boolean,
): Promise<InsertMessageSchema> {
  let [excerpt, richText, threadName]: (string | null)[] = [
    "exc",
    "rich",
    "thread",
  ];
  if (setNullOptionalFields === true) {
    [excerpt, richText, threadName] = [null, null, null];
  }
  const qres = await pool.query<InsertMessageSchema>(
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
        created_at as "createdAt",
        excerpt,
        organisation_id as "organisationId",
        plain_text as "plainText",
        user_id as "recipientUserId",
        rich_text as "richText",
        security_level as security,
        subject,
        thread_name as "threadName",
        is_seen as "isSeen",
        is_delivered as "isDelivered"
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

  return result;
}
