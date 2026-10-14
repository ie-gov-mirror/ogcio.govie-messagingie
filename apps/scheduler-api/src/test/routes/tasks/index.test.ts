import sensible from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import type { DB } from "../../../db/schema.js";
import tasks from "../../../routes/tasks/index.js";

// Route-level coverage for POST /tasks. The handler builds a real
// ScheduledEventService from `app.db`, so we back `app.db` with a real Kysely on
// a mocked pg pool: a resolving pool yields the 202 happy path, a rejecting pool
// drives the catch/500 branch. Permissions are stubbed so the handler runs.
const buildApp = async (db: Kysely<DB>): Promise<FastifyInstance> => {
  const app = fastify();
  await app.register(sensible);
  app.decorate("db", db);
  app.decorate(
    "checkPermissions",
    async (_req: FastifyRequest, _res: FastifyReply, _perms: string[]) => {},
  );
  await app.register(tasks, { prefix: "/tasks" });
  await app.ready();
  return app;
};

const dbFrom = (pool: Pool): Kysely<DB> => createDbFromPool<DB>(pool);

const validBody = [
  {
    webhookUrl: "https://hook.example/1",
    webhookAuth: "auth-1",
    executeAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("POST /tasks", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 202 when the tasks are scheduled", async () => {
    const resolvingPool = {
      connect: () =>
        Promise.resolve({
          query: () =>
            Promise.resolve({ rows: [], command: "INSERT", rowCount: 1 }),
          release: () => {},
        }),
    } as unknown as Pool;
    app = await buildApp(dbFrom(resolvingPool));

    const res = await app.inject({
      method: "POST",
      url: "/tasks",
      body: validBody,
    });

    expect(res.statusCode).toBe(202);
  });

  it("returns 500 when the insert fails", async () => {
    const rejectingPool = {
      connect: () =>
        Promise.resolve({
          query: () => Promise.reject(new Error("db down")),
          release: () => {},
        }),
    } as unknown as Pool;
    app = await buildApp(dbFrom(rejectingPool));

    const res = await app.inject({
      method: "POST",
      url: "/tasks",
      body: validBody,
    });

    expect(res.statusCode).toBe(500);
  });
});
