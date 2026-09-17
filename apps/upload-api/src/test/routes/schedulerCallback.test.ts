import type { S3Client } from "@aws-sdk/client-s3";
import type { PostgresDb } from "@fastify/postgres";
import fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SCHEDULER_TOKEN } from "../../utils/storeConfig.js";

let usedParams: string[] = [];
let markFilesAsDeletedCalled = false;

const buildApp = async ({
  getConfigValue,
  getExpiredFiles,
  s3Send,
  markFilesAsDeleted,
}: {
  getConfigValue: () => Promise<unknown>;
  getExpiredFiles?: () => Promise<unknown>;
  s3Send?: () => Promise<unknown>;
  markFilesAsDeleted?: () => Promise<unknown>;
}) => {
  vi.resetModules();

  vi.doMock("../../utils/storeConfig.js", () => ({
    getConfigValue: getConfigValue,
    SCHEDULER_TOKEN,
  }));

  vi.doMock("../../utils/scheduleCleanupTask.js", () => ({
    default: () => Promise.resolve(),
  }));

  vi.doMock("../../routes/metadata/utils/filesMetadata.js", () => ({
    getExpiredFiles,
    scheduleExpiredFilesForDeletion: () => Promise.resolve(),
    markFilesAsDeleted: () => {
      markFilesAsDeletedCalled = true;

      return markFilesAsDeleted ? markFilesAsDeleted() : Promise.resolve();
    },
  }));

  vi.doMock("@aws-sdk/client-s3", () => ({
    DeleteObjectsCommand: class {
      constructor(...data: string[]) {
        usedParams.push(...data);
      }
    },
  }));

  const app = await fastify();
  await app.register(
    fp(async (fastify) => {
      fastify.decorate("pg", {
        pool: {},
      } as unknown as PostgresDb & Record<string, PostgresDb>);
    }),
  );

  await app.register(
    fp(
      async (fastify) => {
        fastify.decorate("s3Client", {
          config: {
            region: "region",
            endpoint: "",
            forcePathStyle: true,
          },
          bucketName: "",
          client: {
            send: s3Send ? s3Send : () => Promise.resolve({}),
          } as unknown as S3Client,
        });
      },
      { name: "s3ClientPlugin" },
    ),
  );

  const routes = await import("../../routes/schedulerCallback.js");

  await app.register(
    routes as unknown as (app: FastifyInstance) => Promise<void>,
  );

  return app;
};

describe("scheduler", () => {
  let app: FastifyInstance;

  const OriginalDate = Date;

  beforeEach(() => {
    usedParams = [];
    markFilesAsDeletedCalled = false;
    global.Date = class extends OriginalDate {
      constructor() {
        super(OriginalDate.UTC(2024, 0, 5, 0, 0, 0));
      }
    } as DateConstructor;
  });

  afterEach(() => {
    global.Date = OriginalDate;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("Should execute scheduled actions when the api is called with the expected token with no action if no files need to be deleted", async () => {
    app = await buildApp({
      getConfigValue: () => {
        return Promise.resolve("schedulerToken");
      },
      getExpiredFiles: () => Promise.resolve({ rows: [] }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: {
        token: "schedulerToken",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("Should execute scheduled actions and delete files scheduled for deletion", async () => {
    app = await buildApp({
      getConfigValue: () => {
        return Promise.resolve("schedulerToken");
      },
      getExpiredFiles: () =>
        Promise.resolve({
          rows: [
            {
              scheduledDeletionAt: new OriginalDate(
                OriginalDate.UTC(2024, 0, 1, 0, 0, 0),
              ),
              id: "1",
              key: "fileKey",
            },
          ],
        }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: {
        token: "schedulerToken",
      },
    });

    expect(
      (
        usedParams[0] as unknown as {
          Delete: { Objects: [{ Key: string }[]] };
        }
      ).Delete.Objects,
    ).toMatchObject([{ Key: "fileKey" }]);

    expect(markFilesAsDeletedCalled).toBe(true);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("Should not mark files as deleted when an error in s3 happens", async () => {
    app = await buildApp({
      getConfigValue: () => {
        return Promise.resolve("schedulerToken");
      },
      getExpiredFiles: () =>
        Promise.resolve({
          rows: [
            {
              scheduledDeletionAt: new OriginalDate(
                OriginalDate.UTC(2024, 0, 1, 0, 0, 0),
              ),
              id: "1",
              key: "fileKey",
            },
          ],
        }),
      s3Send: () =>
        Promise.resolve({
          Errors: [{ Code: "error", Key: "fileKey", id: "1" }],
        }),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: {
        token: "schedulerToken",
      },
    });

    expect(
      (
        usedParams[0] as unknown as {
          Delete: { Objects: [{ Key: string }[]] };
        }
      ).Delete.Objects,
    ).toMatchObject([{ Key: "fileKey" }]);

    expect(markFilesAsDeletedCalled).toBe(false);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("Should not mark files as deleted when an s3 Send throws", async () => {
    app = await buildApp({
      getConfigValue: () => {
        return Promise.resolve("schedulerToken");
      },
      getExpiredFiles: () =>
        Promise.resolve({
          rows: [
            {
              scheduledDeletionAt: new OriginalDate(
                OriginalDate.UTC(2024, 0, 1, 0, 0, 0),
              ),
              id: "1",
              key: "fileKey",
            },
          ],
        }),
      s3Send: () => Promise.reject("S3 error"),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: {
        token: "schedulerToken",
      },
    });

    expect(
      (
        usedParams[0] as unknown as {
          Delete: { Objects: [{ Key: string }[]] };
        }
      ).Delete.Objects,
    ).toMatchObject([{ Key: "fileKey" }]);

    expect(markFilesAsDeletedCalled).toBe(false);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("Should return a status 200 when markFileAsDeleted throws", async () => {
    const itemsToDelete: {
      scheduledDeletionAt: Date;
      id: number;
      key: string;
    }[] = [];

    for (let i = 0; i < 101; i++) {
      itemsToDelete.push({
        scheduledDeletionAt: new OriginalDate(
          OriginalDate.UTC(2024, 0, 1, 0, 0, 0),
        ),
        id: i,
        key: "fileKey",
      });
    }

    app = await buildApp({
      getConfigValue: () => {
        return Promise.resolve("schedulerToken");
      },
      getExpiredFiles: () =>
        Promise.resolve({
          rows: itemsToDelete,
        }),
      s3Send: () => Promise.resolve({}),
      markFilesAsDeleted: () => Promise.reject("Dummy error"),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: {
        token: "schedulerToken",
      },
    });

    const deletedObjects = (
      usedParams[0] as unknown as {
        Delete: { Objects: [{ Key: string }[]] };
      }
    ).Delete.Objects;

    expect(deletedObjects).toMatchObject(
      itemsToDelete.map((i) => ({ Key: i.key })).slice(0, 100),
    );

    expect(deletedObjects.length).toBe(100);
    expect(markFilesAsDeletedCalled).toBe(true);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("Should return 401 when the api is called with an invalid token", async () => {
    app = await buildApp({
      getConfigValue: () => Promise.resolve("schedulerToken"),
    });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: {
        token: "wrongToken",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
