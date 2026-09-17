import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  assignMessageTag,
  deleteMessages,
  getMessage,
  listMessages,
  processMessage,
} from "../../../services/messages/message-service.js";
import type { CreateMessageBody } from "../../../types/messages.js";
import {
  messagesFailedCounter,
  messagesScheduledCounter,
} from "../../../utils/metrics.js";
import { utils } from "../../../utils/utils.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../../build-testcontainer-pg.js";
import { getMockBaseLogger } from "../../test-server-builder.js";

vi.mock("../../../utils/metrics.js", () => ({
  messagesSentCounter: { add: vi.fn() },
  messagesReadCounter: { add: vi.fn() },
  messagesCreatedCounter: { add: vi.fn() },
  messagesQueueGauge: { record: vi.fn() },
  messagesScheduledCounter: { add: vi.fn() },
  messagesFailedCounter: { add: vi.fn() },
  messageDeliveryDurationHistogram: { record: vi.fn() },
  setupAsyncMetrics: vi.fn(),
}));

vi.mock("../../../utils/authentication-factory.js", () => ({
  getM2MUploadSdk: vi.fn().mockResolvedValue({}),
  getM2MSchedulerSdk: vi.fn().mockResolvedValue({
    scheduleTasks: vi.fn(() => {
      if (schedulerWorks) {
        return [];
      }

      throw new Error("Schedulation failed!");
    }),
  }),
  getPersonalProfileSdk: vi.fn().mockResolvedValue({
    getProfile: vi.fn((id: string) => {
      const notFoundProfileId = "not-found";
      const linkedProfileId = "linked-id";
      if (id === notFoundProfileId) {
        return {
          data: undefined,
          error: { detail: "user not found", statusCode: 404 },
        };
      }
      if (id === linkedProfileId) {
        const childProfileOne = "child-1";
        const childProfileTwo = "child-2";
        return {
          data: {
            id,
            linkedProfiles: [
              {
                id: childProfileOne,
              },
              { id: childProfileTwo },
            ],
          },
        };
      }
      return {
        data: { id, email: `${id}@example.com` },
      };
    }),
  }),
  getM2MProfileSdk: vi.fn().mockResolvedValue({
    getProfile: vi.fn((id: string) => {
      const notFoundProfileId = "not-found";
      const sdkErrorProfileId = "sdk-error";
      const optedOutProfileId = "opted-out";
      const deletedProfileId = "deleted-profile";
      const disabledProfileId = "disabled-profile";
      const optedInProfileId = "opted-in";
      switch (id) {
        case deletedProfileId:
          return {
            data: {
              id,
              email: `${id}@example.com`,
              status: "deleted",
              consentStatuses: { messaging: { status: "opted-in" } },
            },
          };
        case disabledProfileId:
          return {
            data: {
              id,
              email: `${id}@example.com`,
              status: "disabled",
              consentStatuses: { messaging: { status: "opted-in" } },
            },
          };
        case optedOutProfileId:
          return {
            data: {
              id,
              email: `${id}@example.com`,
              consentStatuses: { messaging: { status: "opted-out" } },
              status: "active",
            },
          };
        case optedInProfileId:
          return {
            data: {
              id,
              email: `${id}@example.com`,
              consentStatuses: { messaging: { status: "opted-in" } },
              status: "active",
            },
          };
        case notFoundProfileId:
          return {
            data: undefined,
            error: { detail: "user not found", statusCode: 404 },
          };
        case sdkErrorProfileId:
          return {
            data: undefined,
            error: { detail: "profile sdk failed", statusCode: 500 },
          };
        default:
          return {
            data: { id, email: `${id}@example.com`, status: "active" },
          };
      }
    }),
  }),
}));

let pool: Pool;

let schedulerWorks = true;

type MessageId = string;
async function insertMessage(
  recipientProfileId: string,
  organisationId: string,
  pool: Pool,
): Promise<MessageId> {
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
      is_seen,
      external_id)
    values(
      true,
      $1,
      's',
      'exc',
      'pt',
      'rt',
      'public',
      'en',
      $2,
      'tn',
      $3,
      now(),
      false,
      'external-id-insert-message')
      returning id
  `,

    [recipientProfileId, utils.postgresArrayify([""]), organisationId],
  );

  return qres.rows.at(0).id as string;
}

afterEach(() => {
  schedulerWorks = true;
});

beforeAll(() => {
  pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
  vi.resetAllMocks();
});

describe("Message Service", () => {
  const notFoundProfileId = "not-found";
  const sdkErrorProfileId = "sdk-error";
  const linkedProfileId = "linked-id";
  const optedOutProfileId = "opted-out";
  const deletedProfileId = "deleted-profile";
  const disabledProfileId = "disabled-profile";
  const optedInProfileId = "opted-in";

  describe("processMessages", () => {
    const sender = {
      id: "test-sender-id",
      organizationId: "test-organization-id",
      isM2MApplication: false,
    };

    const getMockMessage = (): CreateMessageBody => ({
      recipientUserId: "test-rec-id",
      message: {
        excerpt: "Test Excerpt",
        language: "en",
        plainText: "Test Plain Text",
        richText: "Test Rich Text",
        subject: "Test Subject",
        threadName: "Test Thread",
        externalId: "external-id-123",
      },
      scheduleAt: "2024-08-27T07:46:10.290Z",
      security: "confidential",
      preferredTransports: ["email"],
      attachments: [],
    });

    it("should process messages successfully", async () => {
      schedulerWorks = true;
      const message = getMockMessage();
      const output = await processMessage({
        pool,
        sender,
        message,
        logger: getMockBaseLogger(),
      });

      expect(output.messageId).toBeDefined();

      const gotMessage = await getMessage({
        pool,
        userId: message.recipientUserId,
        messageId: output.messageId,
        loggedInUser: { userId: message.recipientUserId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      expect(gotMessage).toMatchObject({
        subject: message.message.subject,
        excerpt: message.message.excerpt,
        plainText: message.message.plainText,
        richText: message.message.richText,
        threadName: message.message.threadName,
        security: message.security,
        externalId: message.message.externalId,
      });
    });

    it.each([
      {
        name: "supported formatting",
        input:
          '<p>Hello <strong>there</strong>. <a href="https://www.gov.ie">Read more</a></p>',
        expected:
          '<p>Hello <strong>there</strong>. <a href="https://www.gov.ie">Read more</a></p>',
      },
      {
        name: "active HTML",
        input:
          '<p onclick="alert(1)">Hello<script>alert(1)</script><svg><circle /></svg><form><input /></form><a href="javascript:alert(1)">Bad link</a></p>',
        expected: "<p>Hello</p><a>Bad link</a><p></p>",
      },
      {
        name: "encoded JavaScript URL",
        input: '<a href="jav&#x61;script:alert(1)">Bad link</a>',
        expected: "<a>Bad link</a>",
      },
      {
        name: "Base64-encoded active HTML",
        input: Buffer.from("<p>Hello</p><script>alert(1)</script>").toString(
          "base64",
        ),
        expected: "<p>Hello</p>",
      },
    ])(
      "sanitizes $name before storing rich text",
      async ({ input, expected }) => {
        const message = getMockMessage();
        message.message.richText = input;

        const output = await processMessage({
          pool,
          sender,
          message,
          logger: getMockBaseLogger(),
        });
        const gotMessage = await getMessage({
          pool,
          userId: message.recipientUserId,
          messageId: output.messageId,
          loggedInUser: { userId: message.recipientUserId, accessToken: "123" },
          hasOnboardingPermission: false,
          logger: getMockBaseLogger(),
        });

        expect(gotMessage.richText).toBe(expected);
      },
    );

    it("emits messages_scheduled tagged by organization on successful scheduling", async () => {
      schedulerWorks = true;
      const message = getMockMessage();
      const output = await processMessage({
        pool,
        sender,
        message,
        logger: getMockBaseLogger(),
      });

      expect(output.messageId).toBeDefined();
      expect(messagesScheduledCounter.add).toHaveBeenCalledWith(1, {
        organizationId: expect.any(String),
      });
    });

    it("emits messages_failed tagged by organization and stage=schedule on scheduling failure", async () => {
      schedulerWorks = false;
      const message = getMockMessage();

      await expect(
        processMessage({
          pool,
          sender,
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow("Error scheduling messages");

      expect(messagesFailedCounter.add).toHaveBeenCalledWith(1, {
        organizationId: expect.any(String),
        stage: "schedule",
      });
    });

    it("should process messages with null excerpt, rich text and threadName successfully", async () => {
      schedulerWorks = true;
      const fullMessage = getMockMessage();
      const output = await processMessage({
        pool,
        sender,
        message: {
          ...fullMessage,
          message: {
            ...fullMessage.message,
            richText: undefined,
            excerpt: undefined,
            threadName: undefined,
          },
        },
        logger: getMockBaseLogger(),
      });

      expect(output.messageId).toBeDefined();

      const gotMessage = await getMessage({
        pool,
        userId: fullMessage.recipientUserId,
        messageId: output.messageId,
        loggedInUser: {
          userId: fullMessage.recipientUserId,
          accessToken: "123",
        },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      expect(gotMessage).toMatchObject({
        subject: fullMessage.message.subject,
        excerpt: null,
        plainText: fullMessage.message.plainText,
        richText: null,
        threadName: null,
        security: fullMessage.security,
      });
    });

    it("should return 404 when the recipient profile does not exist", async () => {
      const message = getMockMessage();
      message.recipientUserId = notFoundProfileId;
      await expect(
        processMessage({
          pool,
          sender,
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: `User with ${notFoundProfileId} id not found`,
      });
    });

    it("should return 404 when the sender profile does not exist", async () => {
      const message = getMockMessage();
      await expect(
        processMessage({
          pool,
          sender: { ...sender, id: notFoundProfileId },
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: `User with ${notFoundProfileId} id not found`,
      });
    });

    it("should return 503 when the profile sdk fails", async () => {
      const message = getMockMessage();
      await expect(
        processMessage({
          pool,
          sender: { ...sender, id: sdkErrorProfileId },
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
        message: "Failed fetching user from profile sdk: profile sdk failed",
      });
    });

    it("should handle errors during messaging creation", async () => {
      const message = getMockMessage();

      await expect(
        processMessage({
          pool,
          sender: {
            ...sender,
            organizationId:
              "this-organization-id-is-longer-than-21-that-is-max-length",
          },
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow("Message creation failed");
    });

    it("should handle errors during scheduling", async () => {
      schedulerWorks = false;
      const message = getMockMessage();

      await expect(
        processMessage({
          pool,
          sender,
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow("Error scheduling messages");
    });

    it("should handle opted out error during messaging processing", async () => {
      const message = getMockMessage();
      message.recipientUserId = optedOutProfileId;
      await expect(
        processMessage({
          pool,
          sender: { ...sender, id: sender.id },
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow(
        "User has not consented to receive messages. Please check the user's consent status.",
      );
    });

    it("should process message for opted-out recipient when bypassConsent is true", async () => {
      schedulerWorks = true;
      const message = getMockMessage();
      message.recipientUserId = optedOutProfileId;
      message.bypassConsent = true;

      const output = await processMessage({
        pool,
        sender: { ...sender, id: sender.id },
        message,
        logger: getMockBaseLogger(),
      });

      expect(output.messageId).toBeDefined();

      const gotMessage = await getMessage({
        pool,
        userId: message.recipientUserId,
        messageId: output.messageId,
        loggedInUser: { userId: message.recipientUserId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      expect(gotMessage).toMatchObject({
        subject: message.message.subject,
        excerpt: message.message.excerpt,
        plainText: message.message.plainText,
        richText: message.message.richText,
        threadName: message.message.threadName,
        security: message.security,
        externalId: message.message.externalId,
      });
    });

    it("should handle deleted profile error during messaging processing", async () => {
      const message = getMockMessage();
      message.recipientUserId = deletedProfileId;
      await expect(
        processMessage({
          pool,
          sender: { ...sender, id: sender.id },
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow(
        "User profile is not active. Messages cannot be sent to deleted or disabled profiles.",
      );
    });

    it("should handle disabled profile error during messaging processing", async () => {
      const message = getMockMessage();
      message.recipientUserId = disabledProfileId;
      await expect(
        processMessage({
          pool,
          sender: { ...sender, id: sender.id },
          message,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow(
        "User profile is not active. Messages cannot be sent to deleted or disabled profiles.",
      );
    });

    it("should process messages successfully if user opted in", async () => {
      schedulerWorks = true;
      const message = getMockMessage();
      message.recipientUserId = optedInProfileId;
      const output = await processMessage({
        pool,
        sender,
        message,
        logger: getMockBaseLogger(),
      });

      expect(output.messageId).toBeDefined();

      const gotMessage = await getMessage({
        pool,
        userId: message.recipientUserId,
        messageId: output.messageId,
        loggedInUser: { userId: message.recipientUserId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      expect(gotMessage).toMatchObject({
        subject: message.message.subject,
        excerpt: message.message.excerpt,
        plainText: message.message.plainText,
        richText: message.message.richText,
        threadName: message.message.threadName,
        security: message.security,
        externalId: message.message.externalId,
      });
    });
  });

  describe("getMessage", () => {
    const childProfileOne = "child-1";
    it("should get message for user id", async () => {
      const recipientProfileId = "profileId1";
      const messageId = await insertMessage(recipientProfileId, "org-A", pool);

      const retrievedMessage = await getMessage({
        messageId,
        pool,
        userId: recipientProfileId,
        loggedInUser: { userId: recipientProfileId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });
      expect(retrievedMessage.recipientUserId).toEqual(recipientProfileId);
    });

    it("should throw if no message exist for user id", async () => {
      const recipientProfileId = "profileId1";
      const messageId = await insertMessage("another", "org-A", pool);

      await expect(
        getMessage({
          messageId,
          pool,
          userId: recipientProfileId,
          loggedInUser: { userId: recipientProfileId, accessToken: "123" },
          hasOnboardingPermission: false,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow(
        `No message with id ${messageId} for the logged in user does exist`,
      );
    });

    it("should get message without recipient user id", async () => {
      const messageId = await insertMessage("someId", "org-A", pool);

      const retrievedMessage = await getMessage({
        messageId,
        pool,
        loggedInUser: { accessToken: "123", userId: "someId" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });
      expect(retrievedMessage.recipientUserId).toEqual("someId");
    });

    it("should throw if no message exist without user id", async () => {
      await insertMessage("someId", "org-A", pool);

      await expect(
        getMessage({
          pool,
          messageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          loggedInUser: { userId: "not-exist", accessToken: "123" },
          hasOnboardingPermission: false,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow(
        "No message with id aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa exist",
      );
    });

    it("should get message for linked user id", async () => {
      const messageId = await insertMessage(childProfileOne, "org-A", pool);

      const retrievedMessage = await getMessage({
        messageId,
        pool,
        userId: childProfileOne,
        loggedInUser: { userId: linkedProfileId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      expect(retrievedMessage.recipientUserId).toEqual(childProfileOne);
    });

    it("should throw exception if recipient id is not linked", async () => {
      const messageId = await insertMessage("not-linked", "org-A", pool);

      const retrievedMessage = getMessage({
        messageId,
        pool,
        userId: "not-linked",
        loggedInUser: { userId: linkedProfileId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      await expect(retrievedMessage).rejects.toThrow(
        `No message with id ${messageId} for the logged in user does exist`,
      );
    });

    it("should throw exception if recipient id is not linked and target id not set", async () => {
      const messageId = await insertMessage("not-linked", "org-A", pool);

      const retrievedMessage = getMessage({
        messageId,
        pool,
        loggedInUser: { userId: linkedProfileId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
      });

      await expect(retrievedMessage).rejects.toThrow(
        `No message with id ${messageId} for the logged in user does exist`,
      );
    });

    it("should return 404 for a soft-deleted message by default", async () => {
      const recipientProfileId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(recipientProfileId, "org-A", pool);
      await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
        messageId,
      ]);

      await expect(
        getMessage({
          messageId,
          pool,
          userId: recipientProfileId,
          loggedInUser: { userId: recipientProfileId, accessToken: "123" },
          hasOnboardingPermission: false,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow(
        `No message with id ${messageId} for the logged in user does exist`,
      );
    });

    it("should return a soft-deleted message when deleted flag is set", async () => {
      const recipientProfileId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(recipientProfileId, "org-A", pool);
      await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
        messageId,
      ]);

      const retrievedMessage = await getMessage({
        messageId,
        pool,
        userId: recipientProfileId,
        loggedInUser: { userId: recipientProfileId, accessToken: "123" },
        hasOnboardingPermission: false,
        logger: getMockBaseLogger(),
        deleted: true,
      });

      expect(retrievedMessage.recipientUserId).toEqual(recipientProfileId);
    });

    it("should return 404 for an active message when deleted flag is set", async () => {
      const recipientProfileId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(recipientProfileId, "org-A", pool);

      await expect(
        getMessage({
          messageId,
          pool,
          userId: recipientProfileId,
          loggedInUser: { userId: recipientProfileId, accessToken: "123" },
          hasOnboardingPermission: false,
          logger: getMockBaseLogger(),
          deleted: true,
        }),
      ).rejects.toThrow(
        `No message with id ${messageId} for the logged in user does exist`,
      );
    });
  });

  describe("listMessages", () => {
    const childProfileOne = "child-1";
    const childProfileTwo = "child-2";

    it("should get messages for linked profiles too", async () => {
      const recipientProfileId = linkedProfileId;
      const orgId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(recipientProfileId, orgId, pool);
      const childMessage = await insertMessage(childProfileOne, orgId, pool);
      const childMessageTwo = await insertMessage(childProfileTwo, orgId, pool);
      const messageIds = [messageId, childMessage, childMessageTwo].sort();
      const recipientsIds = [
        recipientProfileId,
        childProfileOne,
        childProfileTwo,
      ].sort();

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: orgId,
          recipientUserId: undefined,
          isSeen: "false",
          search: undefined,
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      expect(retrievedMessages.totalCount).toEqual(3);
      expect(retrievedMessages.data.length).toEqual(3);
      expect(
        retrievedMessages.data.map((d) => d.recipientUserId).sort(),
      ).toStrictEqual(recipientsIds);
      expect(retrievedMessages.data.map((d) => d.id).sort()).toStrictEqual(
        messageIds,
      );
    });

    it("should get messages only for linked profile if query set", async () => {
      const recipientProfileId = linkedProfileId;
      const organizationId = randomUUID().substring(0, 15);
      await insertMessage(recipientProfileId, organizationId, pool);
      const childMessage = await insertMessage(
        childProfileOne,
        organizationId,
        pool,
      );
      await insertMessage(childProfileTwo, organizationId, pool);

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: organizationId,
          recipientUserId: childProfileOne,
          isSeen: "false",
          search: undefined,
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      expect(retrievedMessages.totalCount).toEqual(1);
      expect(retrievedMessages.data.length).toEqual(1);
      expect(
        retrievedMessages.data.map((d) => d.recipientUserId),
      ).toStrictEqual([childProfileOne]);
      expect(retrievedMessages.data.map((d) => d.id)).toStrictEqual([
        childMessage,
      ]);
    });

    it("should get messages only for primary account if query set", async () => {
      const recipientProfileId = linkedProfileId;
      const organizationId = randomUUID().substring(0, 15);
      const mainMessage = await insertMessage(
        recipientProfileId,
        organizationId,
        pool,
      );
      await insertMessage(childProfileOne, organizationId, pool);
      await insertMessage(childProfileTwo, organizationId, pool);

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: organizationId,
          recipientUserId: recipientProfileId,
          isSeen: "false",
          search: undefined,
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      expect(retrievedMessages.totalCount).toEqual(1);
      expect(retrievedMessages.data.length).toEqual(1);
      expect(
        retrievedMessages.data.map((d) => d.recipientUserId),
      ).toStrictEqual([recipientProfileId]);
      expect(retrievedMessages.data.map((d) => d.id)).toStrictEqual([
        mainMessage,
      ]);
    });

    it("should get messages across all organisations when organisationId is undefined", async () => {
      const recipientProfileId = linkedProfileId;
      const orgIdA = randomUUID().substring(0, 12);
      const orgIdB = randomUUID().substring(0, 12);
      const messageA = await insertMessage(recipientProfileId, orgIdA, pool);
      const messageB = await insertMessage(recipientProfileId, orgIdB, pool);
      const messageIds = [messageA, messageB].sort();

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: undefined,
          recipientUserId: recipientProfileId,
          isSeen: undefined,
          search: undefined,
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      expect(retrievedMessages.totalCount).toBeGreaterThanOrEqual(2);
      const ids = retrievedMessages.data.map((d) => d.id).sort();
      for (const id of messageIds) {
        expect(ids).toContain(id);
      }
    });

    it("should filter messages by search term", async () => {
      const recipientProfileId = linkedProfileId;
      const orgId = randomUUID().substring(0, 12);
      await insertMessage(recipientProfileId, orgId, pool);

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: orgId,
          recipientUserId: recipientProfileId,
          isSeen: undefined,
          search: "s",
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      expect(retrievedMessages.totalCount).toBeGreaterThanOrEqual(1);
      expect(retrievedMessages.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should throw exception if recipient is not linked", async () => {
      const recipientProfileId = linkedProfileId;
      const organizationId = randomUUID().substring(0, 15);

      const retrievedMessages = listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: organizationId,
          recipientUserId: "not-a-child",
          isSeen: "false",
          search: undefined,
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      await expect(retrievedMessages).rejects.toThrow(
        "Not allowed to see messages for the requested user",
      );
    });

    it("should not return soft-deleted messages by default", async () => {
      const recipientProfileId = linkedProfileId;
      const orgId = randomUUID().substring(0, 12);
      const activeMsg = await insertMessage(recipientProfileId, orgId, pool);
      const deletedMsg = await insertMessage(recipientProfileId, orgId, pool);
      await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
        deletedMsg,
      ]);

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: orgId,
          recipientUserId: recipientProfileId,
          isSeen: undefined,
          search: undefined,
          deletedAfterDateTime: undefined,
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      const ids = retrievedMessages.data.map((d) => d.id);
      expect(ids).toContain(activeMsg);
      expect(ids).not.toContain(deletedMsg);
    });

    it("should return only soft-deleted messages when deleted flag is set", async () => {
      const recipientProfileId = linkedProfileId;
      const orgId = randomUUID().substring(0, 12);
      const activeMsg = await insertMessage(recipientProfileId, orgId, pool);
      const deletedMsg = await insertMessage(recipientProfileId, orgId, pool);
      const deletedBefore = await insertMessage(
        recipientProfileId,
        orgId,
        pool,
      );
      await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
        deletedMsg,
      ]);
      await pool.query(
        "UPDATE messages SET deleted_at = now() - interval '30 day' WHERE id = $1",
        [deletedBefore],
      );

      const retrievedMessages = await listMessages({
        loggedInUserData: {
          userId: recipientProfileId,
          organizationId: undefined,
          accessToken: "123",
        },
        query: {
          messagesStatus: "delivered",
          organisationId: orgId,
          recipientUserId: recipientProfileId,
          isSeen: undefined,
          search: undefined,
          deletedAfterDateTime: new Date(
            Date.now() - 15 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 15 days ago
          tagId: undefined,
          untagged: undefined,
        },
        pool,
        pagination: { offset: "0", limit: "20" },
        logger: getMockBaseLogger(),
      });

      const ids = retrievedMessages.data.map((d) => d.id);
      expect(ids).toContain(deletedMsg);
      expect(ids).not.toContain(activeMsg);
    });
  });

  describe("deleteMessages", () => {
    const childProfileOne = "child-1";
    const childProfileTwo = "child-2";

    it("should soft-delete a single message owned by the logged-in user", async () => {
      const userId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(userId, "org-A", pool);

      await deleteMessages({
        pool,
        messageIds: [messageId],
        logger: getMockBaseLogger(),
        loggedInUser: { userId, accessToken: "123" },
      });

      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = $1",
        [messageId],
      );
      expect(result.rows[0].deleted_at).not.toBeNull();
    });

    it("should soft-delete multiple messages owned by the logged-in user", async () => {
      const userId = randomUUID().substring(0, 12);
      const msgId1 = await insertMessage(userId, "org-A", pool);
      const msgId2 = await insertMessage(userId, "org-A", pool);

      await deleteMessages({
        pool,
        messageIds: [msgId1, msgId2],
        logger: getMockBaseLogger(),
        loggedInUser: { userId, accessToken: "123" },
      });

      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = ANY($1)",
        [[msgId1, msgId2]],
      );
      for (const row of result.rows) {
        expect(row.deleted_at).not.toBeNull();
      }
    });

    it("should deduplicate message ids", async () => {
      const userId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(userId, "org-A", pool);

      await deleteMessages({
        pool,
        messageIds: [messageId, messageId],
        logger: getMockBaseLogger(),
        loggedInUser: { userId, accessToken: "123" },
      });

      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = $1",
        [messageId],
      );
      expect(result.rows[0].deleted_at).not.toBeNull();
    });

    it("should throw 404 if message does not exist", async () => {
      const userId = randomUUID().substring(0, 12);

      await expect(
        deleteMessages({
          pool,
          messageIds: [randomUUID()],
          logger: getMockBaseLogger(),
          loggedInUser: { userId, accessToken: "123" },
        }),
      ).rejects.toThrow("One or more messages not found");
    });

    it("should throw 404 if some messages exist and some do not", async () => {
      const userId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(userId, "org-A", pool);

      await expect(
        deleteMessages({
          pool,
          messageIds: [messageId, randomUUID()],
          logger: getMockBaseLogger(),
          loggedInUser: { userId, accessToken: "123" },
        }),
      ).rejects.toThrow("One or more messages not found");

      // Ensure the existing message was NOT deleted
      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = $1",
        [messageId],
      );
      expect(result.rows[0].deleted_at).toBeNull();
    });

    it("should throw 404 if message is already soft-deleted", async () => {
      const userId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(userId, "org-A", pool);

      await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
        messageId,
      ]);

      await expect(
        deleteMessages({
          pool,
          messageIds: [messageId],
          logger: getMockBaseLogger(),
          loggedInUser: { userId, accessToken: "123" },
        }),
      ).rejects.toThrow("One or more messages not found");
    });

    it("should throw 404 if mix of existing and already-deleted messages", async () => {
      const userId = randomUUID().substring(0, 12);
      const activeMsgId = await insertMessage(userId, "org-A", pool);
      const deletedMsgId = await insertMessage(userId, "org-A", pool);

      await pool.query("UPDATE messages SET deleted_at = now() WHERE id = $1", [
        deletedMsgId,
      ]);

      await expect(
        deleteMessages({
          pool,
          messageIds: [activeMsgId, deletedMsgId],
          logger: getMockBaseLogger(),
          loggedInUser: { userId, accessToken: "123" },
        }),
      ).rejects.toThrow("One or more messages not found");

      // The active message should NOT have been deleted
      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = $1",
        [activeMsgId],
      );
      expect(result.rows[0].deleted_at).toBeNull();
    });

    it("should throw 403 when deleting messages belonging to an unlinked user", async () => {
      const loggedInUserId = randomUUID().substring(0, 12);
      const otherUserId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(otherUserId, "org-A", pool);

      await expect(
        deleteMessages({
          pool,
          messageIds: [messageId],
          logger: getMockBaseLogger(),
          loggedInUser: { userId: loggedInUserId, accessToken: "123" },
        }),
      ).rejects.toThrow("Not allowed to delete one or more messages");

      // Ensure the message was NOT deleted
      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = $1",
        [messageId],
      );
      expect(result.rows[0].deleted_at).toBeNull();
    });

    it("should allow deleting messages belonging to a linked profile", async () => {
      const messageId = await insertMessage(childProfileOne, "org-A", pool);

      await deleteMessages({
        pool,
        messageIds: [messageId],
        logger: getMockBaseLogger(),
        loggedInUser: { userId: linkedProfileId, accessToken: "123" },
      });

      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = $1",
        [messageId],
      );
      expect(result.rows[0].deleted_at).not.toBeNull();
    });

    it("should allow deleting messages across multiple linked profiles", async () => {
      const ownMsgId = await insertMessage(linkedProfileId, "org-A", pool);
      const child1MsgId = await insertMessage(childProfileOne, "org-A", pool);
      const child2MsgId = await insertMessage(childProfileTwo, "org-A", pool);

      await deleteMessages({
        pool,
        messageIds: [ownMsgId, child1MsgId, child2MsgId],
        logger: getMockBaseLogger(),
        loggedInUser: { userId: linkedProfileId, accessToken: "123" },
      });

      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = ANY($1)",
        [[ownMsgId, child1MsgId, child2MsgId]],
      );
      for (const row of result.rows) {
        expect(row.deleted_at).not.toBeNull();
      }
    });

    it("should throw 403 if mix of linked and unlinked recipient messages", async () => {
      const unlinkedUserId = randomUUID().substring(0, 12);
      const linkedMsgId = await insertMessage(childProfileOne, "org-A", pool);
      const unlinkedMsgId = await insertMessage(unlinkedUserId, "org-A", pool);

      await expect(
        deleteMessages({
          pool,
          messageIds: [linkedMsgId, unlinkedMsgId],
          logger: getMockBaseLogger(),
          loggedInUser: { userId: linkedProfileId, accessToken: "123" },
        }),
      ).rejects.toThrow("Not allowed to delete one or more messages");

      // Neither message should be deleted
      const result = await pool.query(
        "SELECT deleted_at FROM messages WHERE id = ANY($1)",
        [[linkedMsgId, unlinkedMsgId]],
      );
      for (const row of result.rows) {
        expect(row.deleted_at).toBeNull();
      }
    });
  });

  describe("assignMessageTag", () => {
    const childProfileOne = "child-1";

    async function insertTag(ownerId: string): Promise<string> {
      const res = await pool.query<{ id: string }>(
        `INSERT INTO tags(user_id, label, path) VALUES($1, $2, replace(gen_random_uuid()::text, '-', '')::ltree) RETURNING id`,
        [ownerId, `tag-${randomUUID().substring(0, 8)}`],
      );
      return res.rows[0].id;
    }

    it("assigns a tag to the logged-in user's own message", async () => {
      const messageId = await insertMessage(linkedProfileId, "org-A", pool);
      const tagId = await insertTag(linkedProfileId);

      const result = await assignMessageTag({
        pool,
        userId: linkedProfileId,
        accessToken: "123",
        messageIds: [messageId],
        tagId,
        logger: getMockBaseLogger(),
      });

      expect(result).toStrictEqual({ tagId, messageIds: [messageId] });
      const dbRes = await pool.query(
        "SELECT tag_id FROM messages WHERE id = $1",
        [messageId],
      );
      expect(dbRes.rows[0].tag_id).toBe(tagId);
    });

    it("assigns a tag to a linked profile's message (AB#40427)", async () => {
      const messageId = await insertMessage(childProfileOne, "org-A", pool);
      const tagId = await insertTag(linkedProfileId);

      await assignMessageTag({
        pool,
        userId: linkedProfileId,
        accessToken: "123",
        messageIds: [messageId],
        tagId,
        logger: getMockBaseLogger(),
      });

      const dbRes = await pool.query(
        "SELECT tag_id FROM messages WHERE id = $1",
        [messageId],
      );
      expect(dbRes.rows[0].tag_id).toBe(tagId);
    });

    it("removes a tag (null) from a linked profile's message", async () => {
      const messageId = await insertMessage(childProfileOne, "org-A", pool);
      const tagId = await insertTag(linkedProfileId);
      await pool.query("UPDATE messages SET tag_id = $1 WHERE id = $2", [
        tagId,
        messageId,
      ]);

      await assignMessageTag({
        pool,
        userId: linkedProfileId,
        accessToken: "123",
        messageIds: [messageId],
        tagId: null,
        logger: getMockBaseLogger(),
      });

      const dbRes = await pool.query(
        "SELECT tag_id FROM messages WHERE id = $1",
        [messageId],
      );
      expect(dbRes.rows[0].tag_id).toBeNull();
    });

    it("throws 'Message not found' for an unlinked user's message", async () => {
      const unlinkedUserId = randomUUID().substring(0, 12);
      const messageId = await insertMessage(unlinkedUserId, "org-A", pool);
      const tagId = await insertTag(linkedProfileId);

      await expect(
        assignMessageTag({
          pool,
          userId: linkedProfileId,
          accessToken: "123",
          messageIds: [messageId],
          tagId,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow("Message not found");

      const dbRes = await pool.query(
        "SELECT tag_id FROM messages WHERE id = $1",
        [messageId],
      );
      expect(dbRes.rows[0].tag_id).toBeNull();
    });

    it("throws 'Message not found' for a non-existent message", async () => {
      const tagId = await insertTag(linkedProfileId);

      await expect(
        assignMessageTag({
          pool,
          userId: linkedProfileId,
          accessToken: "123",
          messageIds: [randomUUID()],
          tagId,
          logger: getMockBaseLogger(),
        }),
      ).rejects.toThrow("Message not found");
    });
  });
});
