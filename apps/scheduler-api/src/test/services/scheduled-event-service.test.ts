import { createDbFromPool } from "@ogcio/db-core";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { DB } from "../../db/schema.js";
import type { ScheduleTaskInput } from "../../models/scheduled-event-model.js";
import { ScheduledEventService } from "../../services/tasks/scheduled-event-service.js";

// Covers the thin service that composes ScheduledEventModel. We drive it through
// a real Kysely built on a mocked pg pool so the delegation-to-insert behaviour
// is exercised without a live DB.
type QueryCall = { text: string; params: unknown[] };

const buildPoolMock = (calls: QueryCall[]): Pool =>
  ({
    connect: () =>
      Promise.resolve({
        query: (text: string, params: unknown[]) => {
          calls.push({ text, params });
          return Promise.resolve({ rows: [], command: "INSERT", rowCount: 0 });
        },
        release: () => {},
      }),
  }) as unknown as Pool;

const task = (n: number): ScheduleTaskInput => ({
  webhookUrl: `https://hook/${n}`,
  webhookAuth: `auth-${n}`,
  executeAt: `2026-01-0${n}T00:00:00.000Z`,
});

describe("ScheduledEventService.scheduleTasks", () => {
  it("delegates to the model and issues the insert", async () => {
    const calls: QueryCall[] = [];
    const service = new ScheduledEventService(
      createDbFromPool<DB>(buildPoolMock(calls)),
    );

    await service.scheduleTasks([task(1), task(2)]);

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("insert into scheduled_events");
    expect(calls[0].params).toEqual([
      "https://hook/1",
      "auth-1",
      "2026-01-01T00:00:00.000Z",
      "https://hook/2",
      "auth-2",
      "2026-01-02T00:00:00.000Z",
    ]);
  });

  it("propagates errors from the underlying insert", async () => {
    const failingPool = {
      connect: () =>
        Promise.resolve({
          query: () => Promise.reject(new Error("db down")),
          release: vi.fn(),
        }),
    } as unknown as Pool;
    const service = new ScheduledEventService(
      createDbFromPool<DB>(failingPool),
    );

    await expect(service.scheduleTasks([task(1)])).rejects.toThrow("db down");
  });
});
