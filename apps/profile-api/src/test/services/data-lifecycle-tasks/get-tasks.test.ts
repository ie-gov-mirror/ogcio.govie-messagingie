import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LifecycleTaskTypes } from "~/schemas/data-lifecycle-tasks/index.js";
import { createLifecycleTask } from "~/services/data-lifecycle-tasks/create-task.js";
import { getTasks } from "~/services/data-lifecycle-tasks/get-tasks.js";
import { createProfile } from "~/services/profiles/sql/create-profile.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "~/test/build-testcontainer-pg.js";

const pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);

describe("getTasks", () => {
  const profileId = randomUUID().substring(0, 12);

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await createProfile(client, {
        id: profileId,
        primaryUserId: profileId,
        publicName: "Lifecycle Tasks User",
        email: `${profileId}@example.com`,
      });
      await createLifecycleTask({
        client,
        lifecycleTaskInput: {
          task_type: LifecycleTaskTypes.ExportUserData,
          profile_id: profileId,
          scheduled_at: new Date().toISOString(),
          metadata: {},
          requester_user_id: profileId,
          requester_application_id: null,
        },
      });
      await createLifecycleTask({
        client,
        lifecycleTaskInput: {
          task_type: LifecycleTaskTypes.DeleteProfile,
          profile_id: profileId,
          scheduled_at: new Date().toISOString(),
          metadata: {},
          requester_user_id: profileId,
          requester_application_id: null,
        },
      });
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool.ended) {
      await pool.end();
    }
  });

  it("returns all tasks for a profile", async () => {
    const tasks = await getTasks({ profileId, pgpool: pool, taskType: null });
    expect(tasks).toHaveLength(2);
    const types = tasks.map((t) => t.type).sort();
    expect(types).toEqual(
      [
        LifecycleTaskTypes.DeleteProfile,
        LifecycleTaskTypes.ExportUserData,
      ].sort(),
    );
  });

  it("filters by task type", async () => {
    const tasks = await getTasks({
      profileId,
      pgpool: pool,
      taskType: LifecycleTaskTypes.ExportUserData,
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe(LifecycleTaskTypes.ExportUserData);
    expect(tasks[0].status).toBe("pending");
  });

  it("returns an empty list for an unknown profile", async () => {
    const tasks = await getTasks({
      profileId: randomUUID().substring(0, 12),
      pgpool: pool,
      taskType: null,
    });
    expect(tasks).toEqual([]);
  });

  describe("row validation", () => {
    const buildPoolReturning = (rows: { metadata: unknown }[]) =>
      ({
        connect: () =>
          Promise.resolve({
            query: () =>
              Promise.resolve({
                rows: rows.map((row) => ({
                  ...row,
                  metadata: JSON.stringify(row.metadata),
                })),
              }),
            release: () => {},
          }),
      }) as unknown as Pool;

    const validRow = {
      id: "task-1",
      taskType: LifecycleTaskTypes.ExportUserData,
      status: "pending",
      metadata: {},
    };

    it("accepts rows with export metadata containing a valid expiresAt", async () => {
      const tasks = await getTasks({
        profileId: "p",
        taskType: null,
        pgpool: buildPoolReturning([
          {
            ...validRow,
            metadata: {
              type: LifecycleTaskTypes.ExportUserData,
              expiresAt: new Date().toISOString(),
            },
          },
        ]),
      });
      expect(tasks).toHaveLength(1);
    });

    it("rejects rows with an invalid expiresAt in export metadata", async () => {
      await expect(
        getTasks({
          profileId: "p",
          taskType: null,
          pgpool: buildPoolReturning([
            {
              ...validRow,
              metadata: {
                type: LifecycleTaskTypes.ExportUserData,
                expiresAt: "not-a-date",
              },
            },
          ]),
        }),
      ).rejects.toThrow("invalid data parsed");
    });

    it("rejects rows with non-object metadata", async () => {
      await expect(
        getTasks({
          profileId: "p",
          taskType: null,
          pgpool: buildPoolReturning([{ ...validRow, metadata: "nope" }]),
        }),
      ).rejects.toThrow("invalid data parsed");
    });

    it("rejects rows missing required string fields", async () => {
      await expect(
        getTasks({
          profileId: "p",
          taskType: null,
          pgpool: buildPoolReturning([{ ...validRow, id: 42 }]),
        }),
      ).rejects.toThrow("invalid data parsed");
    });
  });
});
