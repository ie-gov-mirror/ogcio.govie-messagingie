import { randomUUID } from "node:crypto";
import type { PostgresDb } from "@fastify/postgres";
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_TYPE, SCHEDULER_TOKEN } from "../../../utils/storeConfig.js";

const buildApp = async ({
  removeFileSharing,
  addFileSharing,
  getFileSharings,
  userCanAccessFileOrThrow,
  infoLogs,
}: {
  removeFileSharing?: () => Promise<unknown>;
  addFileSharing?: () => Promise<unknown>;
  getFileSharings?: () => Promise<unknown>;
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
    default: fp(async (fastify: FastifyInstance) => {
      fastify.addContentTypeParser(
        "multipart/form-data",
        (_req, _payload, done) => done(null),
      );
    }),
  }));

  vi.doMock("@fastify/postgres", () => ({
    default: fp(async (fastify: FastifyInstance) => {
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
    seedConfig: () => Promise.resolve(),
    CONFIG_TYPE,
    SCHEDULER_TOKEN,
  }));

  vi.doMock("../../../utils/scheduleCleanupTask.js", () => ({
    default: () => Promise.resolve(),
  }));

  vi.doMock("../../../routes/permissions/utils/removeFileSharing.js", () => ({
    default: removeFileSharing,
  }));

  vi.doMock("../../../routes/permissions/utils/addFileSharing.js", () => ({
    default: addFileSharing,
  }));

  vi.doMock("../../../routes/permissions/utils/getFileSharings.js", () => ({
    default: getFileSharings,
  }));

  vi.doMock("../../../routes/utils/userCanAccessFileOrThrow.js", () => ({
    default: userCanAccessFileOrThrow,
  }));

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/permissions/index.js");

  const app = await build();
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (infoLogs) {
      // Capture audit-log lines emitted via `request.log.info` while keeping
      // the real logger for everything else fastify relies on.
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
        req.userData = {
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
    prefix: "/permissions",
  });

  await app.ready();
  return app;
};

describe("permissions", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("create", () => {
    it("Should create a file sharing", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        addFileSharing: () =>
          Promise.resolve({
            rows: [],
          }),
      });

      await app.ready();

      const userId = randomUUID().substring(0, 12);
      const response = await app.inject({
        method: "POST",
        url: "/permissions",
        body: { fileId: "fileId", userId },
      });

      expect(response.json()).toMatchObject({
        data: { fileId: "fileId", userId },
      });

      expect(response.statusCode).toBe(201);
    });

    it("Should return 403 when the caller does not own / cannot access the file", async () => {
      const addFileSharing = vi.fn(() => Promise.resolve({ rows: [] }));
      app = await buildApp({
        userCanAccessFileOrThrow: () =>
          Promise.reject(app.httpErrors.forbidden()),
        addFileSharing,
      });

      await app.ready();

      const userId = randomUUID().substring(0, 12);
      const response = await app.inject({
        method: "POST",
        url: "/permissions",
        body: { fileId: "someoneElsesFile", userId },
      });

      expect(response.statusCode).toBe(403);
      // The share must never be written when the ownership check fails.
      expect(addFileSharing).not.toHaveBeenCalled();
    });

    it("Should emit an audit log line when a share is created", async () => {
      const infoLogs: unknown[][] = [];
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        addFileSharing: () => Promise.resolve({ rows: [] }),
        infoLogs,
      });

      await app.ready();

      const userId = randomUUID().substring(0, 12);
      const response = await app.inject({
        method: "POST",
        url: "/permissions",
        body: { fileId: "fileId", userId },
      });

      expect(response.statusCode).toBe(201);
      const auditLine = infoLogs.find(
        (args) => args[1] === "file sharing created",
      );
      expect(auditLine).toBeDefined();
      expect(auditLine?.[0]).toMatchObject({
        fileId: "fileId",
        sharedWith: [userId],
        sharedBy: "userId",
      });
    });

    it("Should throw a validation error for a file sharing with invalid userId", async () => {
      app = await buildApp({
        addFileSharing: () =>
          Promise.resolve({
            rows: [],
          }),
      });

      await app.ready();

      // Expected length of 12 for userId is not respected
      const userId = randomUUID().substring(0, 15);
      const response = await app.inject({
        method: "POST",
        url: "/permissions",
        body: { fileId: "fileId", userId },
      });

      const responseBody = response.json();
      expect(responseBody).toHaveProperty("detail");
      expect(responseBody).toHaveProperty("code");
      expect(responseBody.code).toBe("VALIDATION_ERROR");

      expect(response.statusCode).toBe(422);
    });

    it("Should throw an error when create file sharing fails", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        addFileSharing: () => Promise.reject("Error"),
      });

      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/permissions",
        body: { fileId: "fileId", userId: randomUUID().substring(0, 12) },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  it("Should create multiple sharings", async () => {
    app = await buildApp({
      userCanAccessFileOrThrow: () => Promise.resolve(),
      addFileSharing: () =>
        Promise.resolve({
          rows: [],
        }),
    });

    await app.ready();

    const userIds = [
      randomUUID().substring(0, 12),
      randomUUID().substring(0, 12),
    ];

    const response = await app.inject({
      method: "POST",
      url: "/permissions",
      body: { fileId: "fileId", userIds },
    });

    expect(response.json()).toMatchObject({
      data: { fileId: "fileId", userIds },
    });

    expect(response.statusCode).toBe(201);
  });

  it("Should throw a validation error for multiple sharings with empty userIds", async () => {
    app = await buildApp({
      addFileSharing: () =>
        Promise.resolve({
          rows: [],
        }),
    });

    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/permissions",
      body: { fileId: "fileId", userIds: [] },
    });

    const responseBody = response.json();
    expect(responseBody).toHaveProperty("detail");
    expect(responseBody).toHaveProperty("code");
    expect(responseBody.code).toBe("VALIDATION_ERROR");

    expect(response.statusCode).toBe(422);
  });

  it("Should throw a validation error for multiple sharings with non-valid userIds", async () => {
    app = await buildApp({
      addFileSharing: () =>
        Promise.resolve({
          rows: [],
        }),
    });

    await app.ready();

    const userIds = [
      randomUUID().substring(0, 14),
      randomUUID().substring(0, 15), // Expected length of 12 for userId is not respected
    ];
    const response = await app.inject({
      method: "POST",
      url: "/permissions",
      body: { fileId: "fileId", userIds },
    });

    const responseBody = response.json();
    expect(responseBody).toHaveProperty("detail");
    expect(responseBody).toHaveProperty("code");
    expect(responseBody.code).toBe("VALIDATION_ERROR");

    expect(response.statusCode).toBe(422);
  });

  describe("delete", () => {
    it("Should delete a file sharing", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        removeFileSharing: () =>
          Promise.resolve({
            rows: [],
          }),
      });

      await app.ready();

      const response = await app.inject({
        method: "DELETE",
        url: "/permissions",
        body: { fileId: "fileId", userId: "userId" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("Should throw an error when create file sharing fails", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        removeFileSharing: () => Promise.reject("Error"),
      });

      await app.ready();

      const response = await app.inject({
        method: "DELETE",
        url: "/permissions",
        body: { fileId: "fileId", userId: "userId" },
      });

      expect(response.statusCode).toBe(500);
    });

    it("Should return 403 when a user can't access", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () =>
          Promise.reject(app.httpErrors.forbidden()),
        removeFileSharing: () =>
          Promise.resolve({
            rows: [],
          }),
      });

      await app.ready();

      const response = await app.inject({
        method: "DELETE",
        url: "/permissions",
        body: { fileId: "fileId", userId: "userId" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("list", () => {
    it("Should list file sharings", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileSharings: () =>
          Promise.resolve({
            rows: [{ fileId: "fileId", userId: "userId" }],
          }),
      });

      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/permissions",
        query: { fileId: "fileId" },
      });

      const body = response.json();

      expect(body).toEqual({ data: [{ fileId: "fileId", userId: "userId" }] });

      expect(response.statusCode).toBe(200);
    });

    it("Should throw an error when get file sharing fails", async () => {
      app = await buildApp({
        userCanAccessFileOrThrow: () => Promise.resolve(),
        getFileSharings: () => Promise.reject("Error"),
      });

      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/permissions",
        query: { fileId: "fileId" },
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
