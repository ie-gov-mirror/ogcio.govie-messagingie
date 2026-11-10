import type { PostgresDb } from "@fastify/postgres";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getLinkedProfileIds = vi.fn<(id: string) => Promise<string[]>>();

vi.mock("../../../utils/personal-profile-sdk-wrapper.js", () => ({
  PersonalProfileSdkWrapper: class {
    getLinkedProfileIds = getLinkedProfileIds;
  },
}));

import { userCanAccessMultipleFilesOrThrow } from "../../../routes/utils/userCanAccessMultipleFilesOrThrow.js";

const fakeLogger = {} as FastifyRequest["log"];

/**
 * Fake `pg.connect()` client answering both queries used by
 * userCanAccessMultipleFilesOrThrow: org-owned files and file shares.
 */
function makePg({
  ownedFileIds,
  shares,
}: {
  ownedFileIds: string[];
  shares: { fileId: string; userId: string }[];
}): PostgresDb {
  return {
    connect: async () => ({
      query: async (text: string, params: unknown[]) => {
        if (text.includes("organization_id")) {
          const [, fileIds] = params as [string, string[]];
          return {
            rows: ownedFileIds
              .filter((id) => fileIds.includes(id))
              .map((id) => ({ id })),
          };
        }
        if (text.includes("files_users")) {
          const [fileIds] = params as [string[]];
          return {
            rows: shares
              .filter((s) => fileIds.includes(s.fileId))
              .map((s) => ({ file_id: s.fileId, user_id: s.userId })),
          };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  } as unknown as PostgresDb;
}

beforeEach(() => {
  getLinkedProfileIds.mockReset();
});

describe("userCanAccessMultipleFilesOrThrow", () => {
  it("resolves when a public servant owns all requested files", async () => {
    const pg = makePg({ ownedFileIds: ["F1", "F2"], shares: [] });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "ps-user",
        userData: {
          userId: "ps-user",
          organizationId: "org-1",
          accessToken: "t",
        },
        logger: fakeLogger,
        fileIds: ["F1", "F2"],
      }),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).not.toHaveBeenCalled();
  });

  it("resolves when all files are shared directly with the user", async () => {
    const pg = makePg({
      ownedFileIds: [],
      shares: [
        { fileId: "F1", userId: "citizen" },
        { fileId: "F2", userId: "citizen" },
      ],
    });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "citizen",
        userData: { userId: "citizen", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F1", "F2"],
      }),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).not.toHaveBeenCalled();
  });

  it("resolves when remaining files are shared with a linked profile", async () => {
    getLinkedProfileIds.mockResolvedValue(["child"]);
    const pg = makePg({
      ownedFileIds: [],
      shares: [
        { fileId: "F1", userId: "parent" },
        { fileId: "F2", userId: "child" },
      ],
    });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "parent",
        userData: { userId: "parent", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F1", "F2"],
      }),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).toHaveBeenCalledWith("parent");
  });

  it("throws 403 when a file is shared with nobody related to the user", async () => {
    getLinkedProfileIds.mockResolvedValue([]);
    const pg = makePg({
      ownedFileIds: [],
      shares: [{ fileId: "F1", userId: "someone-else" }],
    });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "stranger",
        userData: { userId: "stranger", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F1"],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 403 for a file with no sharing record", async () => {
    getLinkedProfileIds.mockResolvedValue([]);
    const pg = makePg({ ownedFileIds: [], shares: [] });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "citizen",
        userData: { userId: "support-m2m", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F1"],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("resolves linked profiles for the user to check, not the caller", async () => {
    getLinkedProfileIds.mockImplementation(async (id) =>
      id === "parent" ? ["child"] : [],
    );
    const pg = makePg({
      ownedFileIds: [],
      shares: [{ fileId: "F1", userId: "child" }],
    });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "parent",
        userData: { userId: "support-m2m", accessToken: "t" },
        logger: fakeLogger,
        fileIds: ["F1"],
      }),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).toHaveBeenCalledWith("parent");
  });

  it("resolves when owned files and files shared with the user are mixed", async () => {
    const pg = makePg({
      ownedFileIds: ["F1"],
      shares: [{ fileId: "F2", userId: "ps-user" }],
    });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "ps-user",
        userData: {
          userId: "ps-user",
          organizationId: "org-1",
          accessToken: "t",
        },
        logger: fakeLogger,
        fileIds: ["F1", "F2"],
      }),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when only part of the org files are owned and the rest is unshared", async () => {
    getLinkedProfileIds.mockResolvedValue([]);
    const pg = makePg({
      ownedFileIds: ["F1"],
      shares: [{ fileId: "F2", userId: "someone-else" }],
    });

    await expect(
      userCanAccessMultipleFilesOrThrow({
        pg,
        userToCheck: "ps-user",
        userData: {
          userId: "ps-user",
          organizationId: "org-1",
          accessToken: "t",
        },
        logger: fakeLogger,
        fileIds: ["F1", "F2"],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
