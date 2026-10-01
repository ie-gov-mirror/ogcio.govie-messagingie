import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  CONFIG_TYPE,
  claimNextRun,
  getConfigValue,
  releaseNextRun,
  SCHEDULER_NEXT_RUN_AT,
  seedConfig,
  storeConfig,
} from "../../utils/storeConfig.js";

describe("storeConfig", () => {
  it("should execute store config query with the correct params", async () => {
    const params: string[] = [];

    const poolMock = {
      query: (...values: string[]) => {
        params.push(...values);
      },
    } as unknown as Pool;
    await storeConfig(
      poolMock,
      "key",
      "value",
      "a test key to store",
      CONFIG_TYPE.STRING,
    );

    expect(params[1]).toMatchObject([
      "key",
      "value",
      "string",
      "a test key to store",
    ]);
  });

  it("should not overwrite an existing key when seeding", async () => {
    let sql = "";
    const params: string[] = [];

    const poolMock = {
      query: (query: string, values: string[]) => {
        sql = query;
        params.push(...values);
      },
    } as unknown as Pool;
    await seedConfig(
      poolMock,
      "key",
      "value",
      "a test key to seed",
      CONFIG_TYPE.STRING,
    );

    expect(sql).toContain("ON CONFLICT (key) DO NOTHING");
    expect(params).toMatchObject([
      "key",
      "value",
      "string",
      "a test key to seed",
    ]);
  });

  it("should claim the next run when no run is pending", async () => {
    const nextRunAt = new Date("2024-01-01T05:00:00.000Z");
    let params: unknown[] = [];

    const poolMock = {
      query: (_query: string, values: unknown[]) => {
        params = values;
        return Promise.resolve({ rowCount: 1 });
      },
    } as unknown as Pool;

    await expect(claimNextRun(poolMock, nextRunAt)).resolves.toBe(true);
    expect(params[0]).toBe(SCHEDULER_NEXT_RUN_AT);
    expect(params[1]).toBe(nextRunAt.toISOString());
  });

  it("should not claim the next run when one is already pending", async () => {
    const poolMock = {
      query: () => Promise.resolve({ rowCount: 0 }),
    } as unknown as Pool;

    await expect(claimNextRun(poolMock, new Date())).resolves.toBe(false);
  });

  it("should release the claim for the next run", async () => {
    let params: unknown[] = [];

    const poolMock = {
      query: (_query: string, values: unknown[]) => {
        params = values;
        return Promise.resolve({ rowCount: 1 });
      },
    } as unknown as Pool;
    await releaseNextRun(poolMock);

    expect(params[1]).toBe(SCHEDULER_NEXT_RUN_AT);
  });

  it("should return undefined when a config key is not found", async () => {
    const poolMock = {
      query: () =>
        Promise.resolve({
          rows: [],
        }),
    } as unknown as Pool;
    const value = await getConfigValue(poolMock, "key");

    expect(value).toBeUndefined();
  });

  it("should return a string value", async () => {
    const poolMock = {
      query: () =>
        Promise.resolve({
          rows: [{ value: "value", type: "string" }],
        }),
    } as unknown as Pool;
    const value = await getConfigValue(poolMock, "key");

    expect(value).toBe("value");
    expect(typeof value).toBe("string");
  });

  it("should return a numeric value", async () => {
    const poolMock = {
      query: () =>
        Promise.resolve({
          rows: [{ value: "1", type: "number" }],
        }),
    } as unknown as Pool;
    const value = await getConfigValue(poolMock, "key");

    expect(value).toBe(1);
    expect(typeof value).toBe("number");
  });

  it("should return a boolean value", async () => {
    const poolMock = {
      query: () =>
        Promise.resolve({
          rows: [{ value: "true", type: "boolean" }],
        }),
    } as unknown as Pool;
    const value = await getConfigValue(poolMock, "key");

    expect(value).toBe(true);
    expect(typeof value).toBe("boolean");
  });
});
