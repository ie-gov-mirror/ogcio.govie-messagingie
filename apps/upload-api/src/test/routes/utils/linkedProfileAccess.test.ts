import type { PostgresDb } from "@fastify/postgres";
import { httpErrors } from "@fastify/sensible";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Linked-profile (parent-child) access is derived at read time via
// PersonalProfileSdkWrapper.getLinkedProfileIds. These tests lock in the
// confirmed directionality: a PARENT can reach a file shared with a linked
// CHILD, an UNLINKED user cannot, and a CHILD cannot reach a parent-only file
// (the expansion is downward only).
const getLinkedProfileIds = vi.fn<(id: string) => Promise<string[]>>();

vi.mock("../../../utils/personal-profile-sdk-wrapper.js", () => ({
  PersonalProfileSdkWrapper: class {
    getLinkedProfileIds = getLinkedProfileIds;
  },
}));

// `userCanAccessFileOrThrow` now derives access via SharingService/FileService
// (Kysely) instead of raw pg queries. Mock the service factories so these tests
// exercise the access directionality against an in-memory share set rather than
// the generated SQL. Org ownership is intentionally false for these citizen
// cases (userData carries no organizationId), so FileService is never consulted.
const shareStore: { current: { fileId: string; userId: string }[] } = {
  current: [],
};

vi.mock("../../../services/file-service.js", () => ({
  fileServiceFromPool: () => ({
    isFileOwnedByOrganization: async () => false,
  }),
}));

vi.mock("../../../services/sharing-service.js", () => ({
  sharingServiceFromPool: () => ({
    isSharedWithUser: async (fileId: string, userId: string) =>
      shareStore.current.some(
        (s) => s.fileId === fileId && s.userId === userId,
      ),
    isSharedWithAnyUser: async (fileId: string, userIds: string[]) =>
      shareStore.current.some(
        (s) => s.fileId === fileId && userIds.includes(s.userId),
      ),
  }),
}));

import userCanAccessFileOrThrow from "../../../routes/utils/userCanAccessFileOrThrow.js";
import { userCanAccessMultipleFilesOrThrow } from "../../../routes/utils/userCanAccessMultipleFilesOrThrow.js";

type Share = { fileId: string; userId: string };

const fakeLogger = {} as FastifyRequest["log"];

/** Fake `pg.connect()` client for {@link userCanAccessMultipleFilesOrThrow}. */
function makeMultiFilePg(shares: Share[]): PostgresDb {
  return {
    connect: async () => ({
      query: async (text: string, params: unknown[]) => {
        if (text.includes("files_users")) {
          const [fileIds] = params as [string[]];
          const rows = shares
            .filter((s) => fileIds.includes(s.fileId))
            .map((s) => ({ file_id: s.fileId, user_id: s.userId }));
          return { rows };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  } as unknown as PostgresDb;
}

beforeEach(() => {
  getLinkedProfileIds.mockReset();
  shareStore.current = [];
});

describe("userCanAccessFileOrThrow - linked profiles", () => {
  const buildAppWithPg = (shares: Share[]) => {
    shareStore.current = shares;
    return {
      httpErrors,
      pg: { pool: {} },
    } as unknown as FastifyInstance;
  };

  it("POSITIVE: a file shared with a linked CHILD is accessible to the PARENT", async () => {
    getLinkedProfileIds.mockResolvedValue(["child"]);
    const request = {
      userData: { userId: "parent", accessToken: "t" },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildAppWithPg([{ fileId: "F", userId: "child" }]),
        request,
        "F",
      ),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).toHaveBeenCalledWith("parent");
  });

  it("NEGATIVE: an unrelated user is denied", async () => {
    getLinkedProfileIds.mockResolvedValue([]);
    const request = {
      userData: { userId: "stranger", accessToken: "t" },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildAppWithPg([{ fileId: "F", userId: "child" }]),
        request,
        "F",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("NEGATIVE (downward-only): a child cannot access a parent-only file", async () => {
    // A child has no linked profiles of its own (expansion is downward).
    getLinkedProfileIds.mockResolvedValue([]);
    const request = {
      userData: { userId: "child", accessToken: "t" },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildAppWithPg([{ fileId: "F", userId: "parent" }]),
        request,
        "F",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("userCanAccessMultipleFilesOrThrow - linked profiles", () => {
  it("POSITIVE: a file shared with a linked CHILD is accessible to the PARENT", async () => {
    getLinkedProfileIds.mockResolvedValue(["child"]);

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg: makeMultiFilePg([{ fileId: "F", userId: "child" }]),
        userToCheck: "parent",
        userData: { userId: "parent", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F"],
      }),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).toHaveBeenCalledWith("parent");
  });

  it("NEGATIVE: an unrelated user is denied", async () => {
    getLinkedProfileIds.mockResolvedValue([]);

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg: makeMultiFilePg([{ fileId: "F", userId: "child" }]),
        userToCheck: "stranger",
        userData: { userId: "stranger", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F"],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("NEGATIVE (downward-only): a child cannot access a parent-only file", async () => {
    getLinkedProfileIds.mockResolvedValue([]);

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg: makeMultiFilePg([{ fileId: "F", userId: "parent" }]),
        userToCheck: "child",
        userData: { userId: "child", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F"],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
