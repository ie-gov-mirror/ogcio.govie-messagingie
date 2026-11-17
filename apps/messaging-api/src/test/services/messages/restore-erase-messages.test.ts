import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  deleteMessages,
  eraseMessages,
  getMessage,
  listMessages,
  restoreMessages,
} from "../../../services/messages/message-service.js";
import { utils } from "../../../utils/utils.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../../build-testcontainer-pg.js";
import { getMockBaseLogger } from "../../test-server-builder.js";

const removeFileSharing = vi.fn();
const getM2MUploadSdk = vi.fn();

vi.mock("../../../utils/authentication-factory.js", () => ({
  getM2MUploadSdk: (...args: unknown[]) => getM2MUploadSdk(...args),
  getPersonalProfileSdk: vi.fn().mockResolvedValue({
    getProfile: vi.fn((id: string) => ({
      data: { id, email: `${id}@example.com` },
    })),
  }),
}));

let pool: Pool;

beforeAll(() => {
  pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
});

afterAll(async () => {
  await pool?.end();
});

beforeEach(() => {
  removeFileSharing.mockReset().mockResolvedValue({});
  getM2MUploadSdk.mockReset().mockResolvedValue({ removeFileSharing });
});

const newUserId = () => randomUUID().substring(0, 12);

async function insertMessage(userId: string, orgId = "org-A"): Promise<string> {
  const res = await pool.query(
    `insert into messages(is_delivered, user_id, subject, excerpt, plain_text,
      rich_text, security_level, lang, preferred_transports, thread_name,
      organisation_id, scheduled_at, is_seen)
     values(true, $1, 's', 'exc', 'pt', 'rt', 'public', 'en', $2, 'tn', $3, now(), false)
     returning id`,
    [userId, utils.postgresArrayify([""]), orgId],
  );
  return res.rows[0].id as string;
}

async function attach(messageId: string, attachmentId: string) {
  await pool.query(
    "insert into attachments_messages(message_id, attachment_id) values($1, $2)",
    [messageId, attachmentId],
  );
}

const softDelete = (id: string) =>
  pool.query("update messages set deleted_at = now() where id = $1", [id]);

const row = async (id: string) =>
  (
    await pool.query(
      "select deleted_at, erased_at from messages where id = $1",
      [id],
    )
  ).rows[0] as { deleted_at: Date | null; erased_at: Date | null };

const ctx = (userId: string) => ({
  pool,
  logger: getMockBaseLogger(),
  loggedInUser: { userId, accessToken: "123" },
});

const list = (userId: string, deletedAfterDateTime?: string) =>
  listMessages({
    pool,
    logger: getMockBaseLogger(),
    loggedInUserData: {
      userId,
      organizationId: undefined,
      accessToken: "123",
    },
    query: {
      recipientUserId: userId,
      organisationId: undefined,
      messagesStatus: undefined,
      isSeen: undefined,
      search: undefined,
      deletedAfterDateTime,
      tagId: undefined,
      untagged: undefined,
    },
    pagination: { limit: "50", offset: "0" },
  });

describe("restoreMessages", () => {
  it("moves deleted messages back to the inbox", async () => {
    const userId = newUserId();
    const a = await insertMessage(userId);
    const b = await insertMessage(userId);
    await deleteMessages({ ...ctx(userId), messageIds: [a, b] });

    await restoreMessages({ ...ctx(userId), messageIds: [a, b] });

    expect((await row(a)).deleted_at).toBeNull();
    expect((await row(b)).deleted_at).toBeNull();
    const ids = (await list(userId)).data.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining([a, b]));
  });

  it("rejects a message that is not deleted, restoring nothing", async () => {
    const userId = newUserId();
    const deleted = await insertMessage(userId);
    const live = await insertMessage(userId);
    await softDelete(deleted);

    await expect(
      restoreMessages({ ...ctx(userId), messageIds: [deleted, live] }),
    ).rejects.toThrow("One or more messages not found");

    expect((await row(deleted)).deleted_at).not.toBeNull();
  });

  it("rejects an erased message", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId);
    await softDelete(id);
    await eraseMessages({ ...ctx(userId), messageIds: [id] });

    await expect(
      restoreMessages({ ...ctx(userId), messageIds: [id] }),
    ).rejects.toThrow("One or more messages not found");
  });

  it("rejects messages of an unlinked user", async () => {
    const owner = newUserId();
    const id = await insertMessage(owner);
    await softDelete(id);

    await expect(
      restoreMessages({ ...ctx(newUserId()), messageIds: [id] }),
    ).rejects.toThrow("Not allowed to delete one or more messages");
    expect((await row(id)).deleted_at).not.toBeNull();
  });
});

describe("eraseMessages", () => {
  it("marks deleted messages erased and hides them from every citizen read", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId);
    await softDelete(id);

    await eraseMessages({ ...ctx(userId), messageIds: [id] });

    expect((await row(id)).erased_at).not.toBeNull();
    const deletedList = await list(userId, new Date(0).toISOString());
    expect(deletedList.data.map((m) => m.id)).not.toContain(id);
    await expect(
      getMessage({
        ...ctx(userId),
        userId,
        messageId: id,
        hasOnboardingPermission: false,
        deleted: true,
      }),
    ).rejects.toThrow("does exist");
  });

  it("refuses to erase a message that was not deleted first", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId);

    await expect(
      eraseMessages({ ...ctx(userId), messageIds: [id] }),
    ).rejects.toThrow("One or more messages not found");
    expect((await row(id)).erased_at).toBeNull();
  });

  it("refuses to erase twice", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId);
    await softDelete(id);
    await eraseMessages({ ...ctx(userId), messageIds: [id] });

    await expect(
      eraseMessages({ ...ctx(userId), messageIds: [id] }),
    ).rejects.toThrow("One or more messages not found");
  });

  it("makes an erased message unknown to delete", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId);
    await softDelete(id);
    await eraseMessages({ ...ctx(userId), messageIds: [id] });

    await expect(
      deleteMessages({ ...ctx(userId), messageIds: [id] }),
    ).rejects.toThrow("One or more messages not found");
  });

  it("leaves the sender record in place", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId, "org-sender");
    await softDelete(id);

    await eraseMessages({ ...ctx(userId), messageIds: [id] });

    const res = await pool.query(
      "select organisation_id from messages where id = $1",
      [id],
    );
    expect(res.rows[0].organisation_id).toBe("org-sender");
  });

  it("removes the recipient's access to the attachments", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId, "org-sender");
    const fileA = randomUUID();
    const fileB = randomUUID();
    await attach(id, fileA);
    await attach(id, fileB);
    await softDelete(id);

    await eraseMessages({ ...ctx(userId), messageIds: [id] });

    expect(getM2MUploadSdk).toHaveBeenCalledWith(
      expect.anything(),
      "org-sender",
    );
    expect(removeFileSharing).toHaveBeenCalledTimes(2);
    expect(removeFileSharing).toHaveBeenCalledWith(fileA, userId);
    expect(removeFileSharing).toHaveBeenCalledWith(fileB, userId);
  });

  it("keeps access to an attachment still used by another message of the recipient", async () => {
    const userId = newUserId();
    const erased = await insertMessage(userId, "org-sender");
    const kept = await insertMessage(userId, "org-sender");
    const shared = randomUUID();
    const own = randomUUID();
    await attach(erased, shared);
    await attach(erased, own);
    await attach(kept, shared);
    await softDelete(erased);

    await eraseMessages({ ...ctx(userId), messageIds: [erased] });

    expect(removeFileSharing).toHaveBeenCalledTimes(1);
    expect(removeFileSharing).toHaveBeenCalledWith(own, userId);
  });

  it("does not erase anything when removing attachment access fails", async () => {
    const userId = newUserId();
    const id = await insertMessage(userId, "org-sender");
    await attach(id, randomUUID());
    await softDelete(id);
    removeFileSharing.mockResolvedValue({ error: { detail: "boom" } });

    await expect(
      eraseMessages({ ...ctx(userId), messageIds: [id] }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect((await row(id)).erased_at).toBeNull();
  });
});
