import sensible from "@fastify/sensible";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import tasks from "../../routes/tasks/index.js";

const buildTasksApp = async (query: ReturnType<typeof vi.fn>) => {
  const app = fastify();
  await app.register(sensible);
  app.decorate(
    "checkPermissions",
    vi.fn().mockResolvedValue(undefined) as unknown as PermissionsCheck,
  );
  app.decorate("pg", {
    pool: { query },
  } as unknown as FastifyInstance["pg"]);
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
        {
          webhookUrl: "https://example.com/hook-1",
          webhookAuth: "auth-1",
          executeAt: "2030-01-01T00:00:00.000Z",
        },
        {
          webhookUrl: "https://example.com/hook-2",
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
      "https://example.com/hook-1",
      "auth-1",
      "2030-01-01T00:00:00.000Z",
      "https://example.com/hook-2",
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
      body: [
        {
          webhookUrl: "https://example.com/hook",
          webhookAuth: "auth",
          executeAt: "2030-01-01T00:00:00.000Z",
        },
      ],
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
});

type PermissionsCheck = FastifyInstance["checkPermissions"];
