import sensible from "@fastify/sensible";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import tasks from "../../routes/tasks/index.js";

const SAMPLE_TASK = {
  webhookUrl: "https://example.com/api/v1/jobs/1",
  webhookAuth: "auth-1",
  executeAt: "2030-01-01T00:00:00.000Z",
};

const buildTasksApp = async (
  query: ReturnType<typeof vi.fn>,
  config?: Partial<FastifyInstance["config"]>,
) => {
  const app = fastify();
  await app.register(sensible);
  app.decorate(
    "checkPermissions",
    vi.fn().mockResolvedValue(undefined) as unknown as PermissionsCheck,
  );
  app.decorate("pg", {
    pool: { query },
  } as unknown as FastifyInstance["pg"]);
  app.decorate("config", {
    CALLBACK_MAX_ITEMS: 100,
    CALLBACK_RATE_LIMIT_MAX: 1000,
    CALLBACK_RATE_LIMIT_WINDOW_MS: 60_000,
    ...config,
  } as FastifyInstance["config"]);
  await app.register(tasks);

  return app;
};

describe("POST / schedule tasks", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test("inserts scheduled events and returns 202", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    app = await buildTasksApp(query);

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: [
        SAMPLE_TASK,
        {
          webhookUrl: "https://example.com/api/v1/jobs/2",
          webhookAuth: "auth-2",
          executeAt: "2030-01-02T00:00:00.000Z",
        },
      ],
    });

    expect(res.statusCode).toBe(202);
    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("($1, $2, $3), ($4, $5, $6)");
    expect(values).toEqual([
      "https://example.com/api/v1/jobs/1",
      "auth-1",
      "2030-01-01T00:00:00.000Z",
      "https://example.com/api/v1/jobs/2",
      "auth-2",
      "2030-01-02T00:00:00.000Z",
    ]);
  });

  test("returns 500 when the insert fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("boom"));
    app = await buildTasksApp(query);

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: [SAMPLE_TASK],
    });

    expect(res.statusCode).toBe(500);
  });

  test("rejects invalid payloads with 400", async () => {
    const query = vi.fn();
    app = await buildTasksApp(query);

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: [{ webhookUrl: "not-a-url" }],
    });

    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("rejects oversized batches with 400", async () => {
    const query = vi.fn();
    app = await buildTasksApp(query, { CALLBACK_MAX_ITEMS: 2 });

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: [
        SAMPLE_TASK,
        { ...SAMPLE_TASK, webhookAuth: "2" },
        { ...SAMPLE_TASK, webhookAuth: "3" },
      ],
    });

    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test("enforces per-client rate limiting", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    app = await buildTasksApp(query, { CALLBACK_RATE_LIMIT_MAX: 1 });

    const first = await app.inject({
      method: "POST",
      url: "/",
      body: [SAMPLE_TASK],
    });
    const second = await app.inject({
      method: "POST",
      url: "/",
      body: [SAMPLE_TASK],
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(429);
    expect(query).toHaveBeenCalledOnce();
  });

  test("accepts an empty batch without inserting", async () => {
    const query = vi.fn();
    app = await buildTasksApp(query);

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: [],
    });

    expect(res.statusCode).toBe(202);
    expect(query).not.toHaveBeenCalled();
  });

  test("rethrows client errors from the insert path", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("nope"), { statusCode: 400 }));
    app = await buildTasksApp(query);

    const res = await app.inject({
      method: "POST",
      url: "/",
      body: [SAMPLE_TASK],
    });

    expect(res.statusCode).toBe(400);
  });
});

type PermissionsCheck = FastifyInstance["checkPermissions"];
