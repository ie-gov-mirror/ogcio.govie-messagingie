import { createDbFromPool } from "@ogcio/db-core";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DB } from "../db/schema.js";
import { worker } from "../worker.js";

const CONFIG_ROW = {
  interval: 5,
  size: 2,
  maxRetries: 3,
  callbackTimeout: 1000,
};

const buildApp = (query: ReturnType<typeof vi.fn>) => {
  const pool = {
    query,
    connect: () =>
      Promise.resolve({
        query,
        release: () => {},
      }),
  } as unknown as Pool;

  return {
    db: createDbFromPool<DB>(pool),
    pg: { pool },
    log: { error: vi.fn() },
  } as unknown as FastifyInstance;
};

// The worker fires unitOfWork from a timer without awaiting it; drain the
// microtask queue so the promise chain (query -> fetch -> update) completes.
const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

describe("worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("reads config from the database and polls on its interval", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [CONFIG_ROW] });
    const app = buildApp(query);

    const scheduler = await worker(app, "proc-1");
    scheduler.start();

    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();

    // config query + one select
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("FROM scheduled_events");
    expect(query.mock.calls[1][1]).toEqual([
      CONFIG_ROW.maxRetries,
      CONFIG_ROW.size,
    ]);

    // recursion re-schedules itself
    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();
    expect(query).toHaveBeenCalledTimes(3);
  });

  test("falls back to default config when the config table is empty", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp(query);

    const scheduler = await worker(app, "proc-1");
    scheduler.start();

    await vi.advanceTimersByTimeAsync(10_000);
    await flush();

    expect(query).toHaveBeenCalledTimes(2);
    // default maxRetries 5, default batch size 200
    expect(query.mock.calls[1][1]).toEqual([5, 200]);
  });

  test("marks events delivered when the webhook returns 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, headers: {} });
    vi.stubGlobal("fetch", fetchMock);

    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [CONFIG_ROW] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "id-1",
            webhookUrl: "https://a.example",
            webhookAuth: "s3cr3t",
          },
        ],
      });
    const app = buildApp(query);

    (await worker(app, "proc-1")).start();
    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://a.example",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "s3cr3t" }),
      }),
    );

    expect(query).toHaveBeenCalledTimes(3);
    const [updateSql, logValues] = query.mock.calls[2];
    expect(updateSql).toContain("insert into event_logs");
    expect(updateSql).toContain("('id-1', 'delivered', 0)");
    expect(logValues).toEqual(["proc-1", "id-1", "delivered"]);
  });

  test("marks failed and timed-out webhooks pending with a retry", async () => {
    const timeoutError = Object.assign(new Error("took too long"), {
      name: "TimeoutError",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 500, headers: {} })
      .mockRejectedValueOnce(timeoutError);
    vi.stubGlobal("fetch", fetchMock);

    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [CONFIG_ROW] })
      .mockResolvedValueOnce({
        rows: [
          { id: "id-1", webhookUrl: "https://a.example", webhookAuth: "a" },
          { id: "id-2", webhookUrl: "https://b.example", webhookAuth: "b" },
        ],
      });
    const app = buildApp(query);

    (await worker(app, "proc-1")).start();
    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();

    const [updateSql, logValues] = query.mock.calls[2];
    expect(updateSql).toContain("('id-1', 'pending', 1)");
    expect(updateSql).toContain("('id-2', 'pending', 1)");
    expect(logValues).toEqual(["proc-1", "id-1", "error", "id-2", "timeout"]);
  });

  test("does not call webhooks when no events are due", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [CONFIG_ROW] });
    const app = buildApp(query);

    (await worker(app, "proc-1")).start();
    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  test("logs when updating events and logs fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, headers: {} }),
    );

    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [CONFIG_ROW] })
      .mockResolvedValueOnce({
        rows: [
          { id: "id-1", webhookUrl: "https://a.example", webhookAuth: "a" },
        ],
      })
      .mockImplementationOnce(() => {
        throw new Error("update exploded");
      });
    const app = buildApp(query);

    (await worker(app, "proc-1")).start();
    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();

    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ processId: "proc-1" }),
      "failed to update events and create logs",
    );
  });

  test("logs when the select query fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [CONFIG_ROW] })
      .mockRejectedValue(new Error("select exploded"));
    const app = buildApp(query);

    (await worker(app, "proc-1")).start();
    await vi.advanceTimersByTimeAsync(CONFIG_ROW.interval);
    await flush();

    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ processId: "proc-1", batchSize: 2 }),
      "failed unit of work",
    );
  });
});
