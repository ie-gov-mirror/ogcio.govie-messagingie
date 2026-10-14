import { httpErrors } from "@fastify/sensible";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Unlike `linkedProfileAccess.test.ts` (which mocks fileServiceFromPool /
// sharingServiceFromPool), this suite un-mocks the service factories so the
// access decision flows through the REAL SharingService/FileService and their
// SharingModel/FileModel Kysely queries, against a mocked pg pool. That guards
// the access-directionality of the db-core consolidation end to end: org
// ownership, direct share, linked-profile share, and the deny/throw path.
//
// Only the external profile SDK (linked-profile expansion) is mocked, matching
// the existing suite.
const getLinkedProfileIds = vi.fn<(id: string) => Promise<string[]>>();

vi.mock("../../../utils/personal-profile-sdk-wrapper.js", () => ({
  PersonalProfileSdkWrapper: class {
    getLinkedProfileIds = getLinkedProfileIds;
  },
}));

import userCanAccessFileOrThrow from "../../../routes/utils/userCanAccessFileOrThrow.js";

type Ownership = { organizationId: string; fileId: string };
type Share = { fileId: string; userId: string };

/**
 * Mocked pg pool that answers the three real access queries by inspecting the
 * generated SQL + params against in-memory ownership/share sets. Kysely calls
 * `pool.connect()` then `client.query(sql, params)`.
 */
const buildPoolMock = (owned: Ownership[], shares: Share[]): Pool =>
  ({
    connect: () =>
      Promise.resolve({
        query: (text: string, params: unknown[]) => {
          // FileModel.isOwnedByOrganization: SELECT ... FROM files WHERE
          // organization_id = $1 and id = $2
          if (text.includes("FROM files") && text.includes("organization_id")) {
            const [organizationId, fileId] = params as [string, string];
            const rows = owned.filter(
              (o) => o.organizationId === organizationId && o.fileId === fileId,
            );
            return Promise.resolve({ rows });
          }
          // SharingModel.isSharedWithAnyUser: ... user_id = ANY($2)
          if (text.includes("files_users") && text.includes("ANY(")) {
            const [fileId, userIds] = params as [string, string[]];
            const rows = shares.filter(
              (s) => s.fileId === fileId && userIds.includes(s.userId),
            );
            return Promise.resolve({ rows });
          }
          // SharingModel.isSharedWithUser: ... user_id = $2
          if (text.includes("files_users")) {
            const [fileId, userId] = params as [string, string];
            const rows = shares.filter(
              (s) => s.fileId === fileId && s.userId === userId,
            );
            return Promise.resolve({ rows });
          }
          return Promise.resolve({ rows: [] });
        },
        release: () => {},
      }),
  }) as unknown as Pool;

const buildApp = (owned: Ownership[], shares: Share[]): FastifyInstance =>
  ({
    httpErrors,
    pg: { pool: buildPoolMock(owned, shares) },
  }) as unknown as FastifyInstance;

const fakeLogger = {} as FastifyRequest["log"];

beforeEach(() => {
  getLinkedProfileIds.mockReset();
  getLinkedProfileIds.mockResolvedValue([]);
});

describe("userCanAccessFileOrThrow (real services / mocked pool)", () => {
  it("POSITIVE: a public servant can access a file owned by their organization", async () => {
    const request = {
      userData: { userId: "ps", organizationId: "org-1", accessToken: "t" },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildApp([{ organizationId: "org-1", fileId: "F" }], []),
        request,
        "F",
      ),
    ).resolves.toBeUndefined();
    // Org ownership short-circuits before the profile SDK is consulted.
    expect(getLinkedProfileIds).not.toHaveBeenCalled();
  });

  it("POSITIVE: a citizen can access a file shared directly with them", async () => {
    const request = {
      userData: { userId: "citizen", accessToken: "t" },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildApp([], [{ fileId: "F", userId: "citizen" }]),
        request,
        "F",
      ),
    ).resolves.toBeUndefined();
  });

  it("POSITIVE: a parent can access a file shared with a linked child", async () => {
    getLinkedProfileIds.mockResolvedValue(["child"]);
    const request = {
      userData: { userId: "parent", accessToken: "t" },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildApp([], [{ fileId: "F", userId: "child" }]),
        request,
        "F",
      ),
    ).resolves.toBeUndefined();
    expect(getLinkedProfileIds).toHaveBeenCalledWith("parent");
  });

  it("NEGATIVE: an unrelated user with no org/share/link is denied", async () => {
    const request = {
      userData: {
        userId: "stranger",
        organizationId: "org-2",
        accessToken: "t",
      },
      log: fakeLogger,
    } as unknown as FastifyRequest;

    await expect(
      userCanAccessFileOrThrow(
        buildApp(
          [{ organizationId: "org-1", fileId: "F" }],
          [{ fileId: "F", userId: "owner" }],
        ),
        request,
        "F",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
