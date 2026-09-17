import type { PostgresDb } from "@fastify/postgres";
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";
import type { PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFiles } from "../../../routes/metadata/utils/filesMetadata.js";
import { CONFIG_TYPE } from "../../../utils/storeConfig.js";

const buildApp = async ({
  getUserFiles,
  getOrganizationFiles,
  getSharedFiles,
  getFileMetadataById,
  getFileSharings,
  getSharedFilesPerOrganization,
  scheduleFileForDeletion,
  removeAllFileSharings,
  userCanAccessFileOrThrow,
  userData,
  infoLogs,
}: {
  userData?: {
    isM2MApplication: boolean;
    userId: string;
    accessToken: string;
    organizationId?: string;
  };
  getUserFiles?: () => Promise<unknown>;
  getOrganizationFiles?: () => Promise<unknown>;
  getSharedFiles?: () => Promise<unknown>;
  getFileMetadataById?: () => Promise<unknown>;
  getFileSharings?: () => Promise<unknown>;
  getSharedFilesPerOrganization?: () => Promise<unknown>;
  scheduleFileForDeletion?: () => Promise<unknown>;
  removeAllFileSharings?: () => Promise<unknown>;
  userCanAccessFileOrThrow?: () => Promise<unknown>;
  infoLogs?: unknown[][];
}) => {
  vi.resetModules();

  vi.doMock("@fastify/autoload", () => ({
    default: async () => {},
  }));

  vi.doMock("../../../routes/index.js", () => ({
    default: async () => {},
  }));

  vi.doMock("@fastify/multipart", () => ({
    default: fp(async (fastify) => {
      fastify.addContentTypeParser(
        "multipart/form-data",
        (_req, _payload, done) => done(null),
      );
    }),
  }));

  vi.doMock("@fastify/postgres", () => ({
    default: fp(async (fastify) => {
      fastify.decorate("pg", {
        pool: {
          connect: () =>
            Promise.resolve({
              release: () => Promise.resolve(),
            }),
        },
      } as unknown as PostgresDb & Record<string, PostgresDb>);
    }),
  }));

  vi.doMock("../../../utils/storeConfig.js", () => ({
    storeConfig: () => Promise.resolve(),
    CONFIG_TYPE,
    SCHEDULER_TOKEN: "SCHEDULER_TOKEN",
  }));

  vi.doMock("../../../utils/scheduleCleanupTask.js", () => ({
    default: () => Promise.resolve(),
  }));

  vi.doMock("../../../routes/metadata/utils/filesMetadata.js", () => ({
    getUserFiles,
    getOrganizationFiles,
    getSharedFiles,
    getSharedFilesPerOrganization,
    scheduleFileForDeletion,
  }));

  vi.doMock("../../../routes/utils/getFileMetadataById.js", () => ({
    default: getFileMetadataById,
  }));

  vi.doMock("../../../routes/metadata/utils/getFileSharings.js", () => ({
    default: getFileSharings,
  }));

  vi.doMock("../../../routes/metadata/utils/removeAllFileSharings.js", () => ({
    default: removeAllFileSharings,
  }));

  vi.doMock("../../../routes/utils/userCanAccessFileOrThrow.js", () => ({
    default: userCanAccessFileOrThrow,
  }));

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/metadata/index.js");

  const app = await build();
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (infoLogs) {
      const originalLog = req.log;
      const captured = Object.create(originalLog);
      captured.info = (...args: unknown[]) => {
        infoLogs.push(args);
        return originalLog.info(...(args as [unknown]));
      };
      req.log = captured;
    }
    // Override the request decorator
    app.checkPermissions = async (
      request: FastifyRequest,
      _reply: FastifyReply,
      _permissions: string[],
      _matchConfig?: { method: "AND" | "OR" },
    ) => {
      // biome-ignore lint/complexity/noUselessLoneBlockStatements: it's used
      {
        req.userData = request.userData = userData || {
          isM2MApplication: false,
          userId: "userId",
          accessToken: "accessToken",
          organizationId: "ogcio",
        };

        request.userData = req.userData;
      }
    };
  });
  await app.register(routes as unknown as FastifyPluginCallback, {
    prefix: "/metadata",
  });

  await app.ready();
  return app;
};

describe("metadata", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  describe("list", () => {
    describe("ensureUserCanAccessResource", () => {
      it("Public servants should not be able to query other organizations", async () => {
        app = await buildApp({});
        await app.ready();
        const response = await app.inject({
          method: "GET",
          url: "/metadata",
          query: {
            organizationId: "another-org",
          },
        });
        expect(response.statusCode).toBe(403);
      });

      it("Citizens should not be able to query other users", async () => {
        app = await buildApp({
          userData: {
            accessToken: "",
            isM2MApplication: false,
            userId: "user-id",
          },
        });
        await app.ready();
        const response = await app.inject({
          method: "GET",
          url: "/metadata",
          query: {
            userId: "anotherId",
          },
        });
        expect(response.statusCode).toBe(403);
      });

      it("Citizens should not be able to query organizations", async () => {
        app = await buildApp({
          userData: {
            accessToken: "",
            isM2MApplication: false,
            userId: "user-id",
          },
        });
        await app.ready();
        const response = await app.inject({
          method: "GET",
          url: "/metadata",
          query: {
            userId: "user-id",
            organizationId: "orgId",
          },
        });
        expect(response.statusCode).toBe(403);
      });
    });

    it("Public servants should be able to retrieve all files for the requested user", async () => {
      app = await buildApp({
        getUserFiles: () =>
          Promise.resolve([
            {
              fileName: "fileName",
              id: "1",
              key: "user/fileName",
              ownerId: "user",
              organizationId: "ogcio",
              fileSize: 100,
              mimeType: "image/png",
              createdAt: "2024-08-12T13:12:18.681Z",
              lastScan: "2024-08-12T13:12:18.681Z",
              deleted: false,
              infected: false,
              infectionDescription: null,
              antivirusDbVersion: "1",
            },
          ]),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata",
        query: {
          organizationId: "ogcio",
          userId: "user",
        },
      });

      expect(response.json().data).toEqual([
        {
          fileName: "fileName",
          id: "1",
          key: "user/fileName",
          ownerId: "user",
          fileSize: 100,
          mimeType: "image/png",
          createdAt: "2024-08-12T13:12:18.681Z",
          lastScan: "2024-08-12T13:12:18.681Z",
          deleted: false,
          infected: false,
          infectionDescription: "",
          antivirusDbVersion: "1",
        },
      ]);
    });

    it("Public servants should be able to retrieve all files within their org", async () => {
      app = await buildApp({
        getOrganizationFiles: () =>
          Promise.resolve({
            rows: [
              {
                fileName: "fileName",
                id: "1",
                key: "user/fileName",
                ownerId: "user",
                organizationId: "ogcio",
                fileSize: 100,
                mimeType: "image/png",
                createdAt: "2024-08-12T13:12:18.681Z",
                lastScan: "2024-08-12T13:12:18.681Z",
                deleted: false,
                infected: false,
                infectionDescription: null,
                antivirusDbVersion: "1",
              },
            ],
          }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata",
        query: {
          organizationId: "ogcio",
        },
      });

      expect(response.json().data).toEqual([
        {
          fileName: "fileName",
          id: "1",
          key: "user/fileName",
          ownerId: "user",
          fileSize: 100,
          mimeType: "image/png",
          createdAt: "2024-08-12T13:12:18.681Z",
          lastScan: "2024-08-12T13:12:18.681Z",
          deleted: false,
          infected: false,
          infectionDescription: "",
          antivirusDbVersion: "1",
        },
      ]);
    });

    it("Citizen should be able to retrieve files shared with them", async () => {
      app = await buildApp({
        userData: {
          accessToken: "",
          isM2MApplication: false,
          userId: "userId",
        },
        getSharedFiles: () =>
          Promise.resolve({
            rows: [
              {
                fileName: "fileName",
                id: "1",
                key: "user/fileName",
                ownerId: "userId",
                organizationId: "ogcio",
                fileSize: 100,
                mimeType: "image/png",
                createdAt: "2024-08-12T13:12:18.681Z",
                lastScan: "2024-08-12T13:12:18.681Z",
                deleted: false,
                infected: false,
                infectionDescription: null,
                antivirusDbVersion: "1",
              },
            ],
          }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata",
        query: {
          userId: "userId",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([
        {
          fileName: "fileName",
          id: "1",
          key: "user/fileName",
          ownerId: "userId",
          fileSize: 100,
          mimeType: "image/png",
          createdAt: "2024-08-12T13:12:18.681Z",
          lastScan: "2024-08-12T13:12:18.681Z",
          deleted: false,
          infected: false,
          infectionDescription: "",
          antivirusDbVersion: "1",
        },
      ]);
    });

    it("Should throw if a retrieval operation fails", async () => {
      app = await buildApp({
        userData: {
          accessToken: "",
          isM2MApplication: false,
          userId: "userId",
        },
        getSharedFiles: () => Promise.reject("Error"),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata",
        query: {
          userId: "userId",
        },
      });

      expect(response.statusCode).toBe(500);
    });

    it("getUserFiles should return files for the requested organization and user", async () => {
      let counter = 0;

      const client = {
        query: () => {
          if (counter++ === 0) {
            return Promise.resolve({
              rows: [
                {
                  id: "id-1",
                  ownerId: "userId",
                  organization: "ogcio",
                },
              ],
            });
          } else {
            return Promise.resolve({
              rows: [
                {
                  id: "id-2",
                  ownerId: "userId",
                  organization: "ogcio",
                },
              ],
            });
          }
        },
      };

      const data = await getUserFiles({
        client: client as unknown as PoolClient,
        userId: "userId",
        organizationId: "organizationId",
        toExclude: [],
      });

      expect(data).toEqual([
        { id: "id-1", ownerId: "userId", organization: "ogcio" },
        { id: "id-2", ownerId: "userId", organization: "ogcio" },
      ]);
    });

    it("getUserFiles should return files for the requested organization and user with exclusions", async () => {
      let counter = 0;
      const queryParams: string[] = [];
      const client = {
        query: (...params: string[]) => {
          queryParams.push(...params);
          if (counter++ === 0) {
            return Promise.resolve({
              rows: [
                {
                  id: "id-1",
                  ownerId: "userId",
                  organization: "ogcio",
                },
              ],
            });
          } else {
            return Promise.resolve({
              rows: [
                {
                  id: "id-2",
                  ownerId: "userId",
                  organization: "ogcio",
                },
              ],
            });
          }
        },
      };

      const data = await getUserFiles({
        client: client as unknown as PoolClient,
        userId: "userId",
        organizationId: "organizationId",
        toExclude: ["id-1"],
      });

      expect(queryParams[1][2]).toEqual("id-1");

      expect(data).toEqual([
        { id: "id-1", ownerId: "userId", organization: "ogcio" },
        { id: "id-2", ownerId: "userId", organization: "ogcio" },
      ]);
    });
  });

  describe("get", () => {
    it("Should return file metadata", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () =>
          Promise.resolve({
            rows: [
              {
                fileName: "fileName",
                id: "1",
                key: "user/fileName",
                ownerId: "user",
                fileSize: 100,
                mimeType: "image/png",
                createdAt: "2024-08-12T13:12:18.681Z",
                lastScan: "2024-08-12T13:12:18.681Z",
                deleted: false,
                infected: false,
                infectionDescription: null,
                antivirusDbVersion: "1",
              },
            ],
          }),
        getFileSharings: () => Promise.resolve({ rows: [] }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata/1",
      });

      expect(response.json()).toMatchObject({
        data: {
          fileName: "fileName",
          id: "1",
          key: "user/fileName",
          ownerId: "user",
          fileSize: 100,
          mimeType: "image/png",
          createdAt: "2024-08-12T13:12:18.681Z",
          lastScan: "2024-08-12T13:12:18.681Z",
          deleted: false,
          infected: false,
          infectionDescription: "",
          antivirusDbVersion: "1",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("Should thow a 404 error if file metadata is not found", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () =>
          Promise.resolve({
            rows: [],
          }),
        getFileSharings: () => Promise.resolve({ rows: [] }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata/1",
      });

      expect(response.statusCode).toBe(404);
    });

    it("Should thow a 403 error if user cannot access file", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () =>
          Promise.reject(app.httpErrors.forbidden("Forbidden")),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata/1",
      });

      expect(response.statusCode).toBe(403);
    });

    it("Should thow an error if get metadata throws", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () => Promise.reject("Error"),
        getFileSharings: () => Promise.resolve({ rows: [] }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata/1",
      });

      expect(response.statusCode).toBe(500);
    });

    it("Should throw an error when profile sdk throws", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () => Promise.resolve({ rows: [{ key: "key" }] }),
        getFileSharings: () => Promise.resolve({ rows: [] }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata/1",
      });
      expect(response.statusCode).toBe(500);
    });

    it("Should throw an error when profile returns an error", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () => Promise.resolve({ rows: [{ key: "key" }] }),
        getFileSharings: () => Promise.resolve({ rows: [] }),
      });

      const response = await app.inject({
        method: "GET",
        url: "/metadata/1",
      });
      expect(response.statusCode).toBe(500);
    });
  });

  describe("delete", () => {
    const OriginalDate = Date;

    beforeEach(() => {
      // @ts-expect-error - Mocking Date constructor
      global.Date = class extends OriginalDate {
        constructor() {
          super(OriginalDate.UTC(2024, 0, 1, 0, 0, 0));
        }
      };
    });

    afterEach(() => {
      global.Date = OriginalDate;
    });

    const ownOrgFile = {
      fileName: "fileName",
      id: "1",
      key: "user/fileName",
      ownerId: "user",
      fileSize: 100,
      mimeType: "image/png",
      createdAt: "2024-08-12T13:12:18.681Z",
      lastScan: "2024-08-12T13:12:18.681Z",
      deleted: false,
      infected: false,
      infectionDescription: null,
      antivirusDbVersion: "1",
    };

    it("Should schedule a file metadata for deletion and return scheduled file id", async () => {
      const infoLogs: unknown[][] = [];
      const scheduleFileForDeletion = vi.fn(() =>
        Promise.resolve({ rows: [] }),
      );
      const removeAllFileSharings = vi.fn(() => Promise.resolve());

      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () => Promise.resolve({ rows: [ownOrgFile] }),
        scheduleFileForDeletion,
        removeAllFileSharings,
        infoLogs,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: {
          fileId: "1",
        },
      });

      expect(response.json()).toMatchObject({
        data: {
          id: "1",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleFileForDeletion).toHaveBeenCalled();
      expect(removeAllFileSharings).toHaveBeenCalled();
      const auditLine = infoLogs.find(
        (args) => args[1] === "file deletion scheduled",
      );
      expect(auditLine?.[0]).toMatchObject({
        fileId: "1",
        userId: "userId",
        allowed: true,
      });
    });

    it("Should allow deletion when the caller can access the file via share (same helper as GET)", async () => {
      const scheduleFileForDeletion = vi.fn(() =>
        Promise.resolve({ rows: [] }),
      );
      const removeAllFileSharings = vi.fn(() => Promise.resolve());

      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () => Promise.resolve({ rows: [ownOrgFile] }),
        scheduleFileForDeletion,
        removeAllFileSharings,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: { fileId: "shared-file" },
      });

      expect(response.statusCode).toBe(200);
      expect(scheduleFileForDeletion).toHaveBeenCalled();
    });

    it("Should return 403 and not delete when the file is outside the caller's org", async () => {
      const scheduleFileForDeletion = vi.fn(() =>
        Promise.resolve({ rows: [] }),
      );
      const removeAllFileSharings = vi.fn(() => Promise.resolve());
      const infoLogs: unknown[][] = [];

      app = await buildApp({
        userCanAccessFileOrThrow: () =>
          Promise.reject(
            app.httpErrors.forbidden("User cannot access this file"),
          ),
        getFileMetadataById: () => Promise.resolve({ rows: [ownOrgFile] }),
        scheduleFileForDeletion,
        removeAllFileSharings,
        infoLogs,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: { fileId: "other-org-file" },
      });

      expect(response.statusCode).toBe(403);
      expect(scheduleFileForDeletion).not.toHaveBeenCalled();
      expect(removeAllFileSharings).not.toHaveBeenCalled();
      const auditLine = infoLogs.find(
        (args) => args[1] === "file deletion denied",
      );
      expect(auditLine?.[0]).toMatchObject({
        fileId: "other-org-file",
        userId: "userId",
        allowed: false,
      });
    });

    it("Should return 403 and not delete for an unknown file id", async () => {
      const scheduleFileForDeletion = vi.fn(() =>
        Promise.resolve({ rows: [] }),
      );
      const removeAllFileSharings = vi.fn(() => Promise.resolve());
      const infoLogs: unknown[][] = [];

      app = await buildApp({
        userCanAccessFileOrThrow: () =>
          Promise.reject(
            app.httpErrors.forbidden("User cannot access this file"),
          ),
        getFileMetadataById: () => Promise.resolve({ rows: [] }),
        scheduleFileForDeletion,
        removeAllFileSharings,
        infoLogs,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: { fileId: "unknown-file" },
      });

      expect(response.statusCode).toBe(403);
      expect(scheduleFileForDeletion).not.toHaveBeenCalled();
      expect(removeAllFileSharings).not.toHaveBeenCalled();
      const auditLine = infoLogs.find(
        (args) => args[1] === "file deletion denied",
      );
      expect(auditLine?.[0]).toMatchObject({
        fileId: "unknown-file",
        userId: "userId",
        allowed: false,
      });
    });

    it("Should throw a bad request error if file id is not provided", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () =>
          Promise.resolve({
            rows: [],
          }),
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: { fileId: "" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("Should throw a 404 when the metadata is not found", async () => {
      const scheduleFileForDeletion = vi.fn(() =>
        Promise.resolve({ rows: [] }),
      );
      const removeAllFileSharings = vi.fn(() => Promise.resolve());
      const infoLogs: unknown[][] = [];

      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () =>
          Promise.resolve({
            rows: [],
          }),
        scheduleFileForDeletion,
        removeAllFileSharings,
        infoLogs,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: {
          fileId: "1",
        },
      });

      expect(response.statusCode).toBe(404);
      expect(scheduleFileForDeletion).not.toHaveBeenCalled();
      expect(removeAllFileSharings).not.toHaveBeenCalled();
      const auditLine = infoLogs.find(
        (args) => args[1] === "file deletion denied",
      );
      expect(auditLine?.[0]).toMatchObject({
        fileId: "1",
        userId: "userId",
        allowed: false,
      });
    });

    it("Should throw a 500 when a query operation throws", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileMetadataById: () =>
          Promise.resolve({
            rows: [
              {
                fileName: "fileName",
                id: "1",
                key: "user/fileName",
                ownerId: "user",
                fileSize: 100,
                mimeType: "image/png",
                createdAt: "2024-08-12T13:12:18.681Z",
                lastScan: "2024-08-12T13:12:18.681Z",
                deleted: false,
                infected: false,
                infectionDescription: null,
                antivirusDbVersion: "1",
              },
            ],
          }),
        scheduleFileForDeletion: () => Promise.reject("error"),
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/metadata/",
        body: {
          fileId: "1",
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
