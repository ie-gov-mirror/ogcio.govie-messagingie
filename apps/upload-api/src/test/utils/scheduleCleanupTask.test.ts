import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEDULER_TOKEN } from "../../utils/storeConfig.js";

describe("scheduleCleanupTask", () => {
  const OriginalDate = Date;

  beforeEach(() => {
    vi.resetModules();
    global.Date = class extends OriginalDate {
      constructor() {
        super(OriginalDate.UTC(2024, 0, 1, 0, 0, 0));
      }
    } as DateConstructor;
  });

  afterEach(() => {
    global.Date = OriginalDate;
  });

  it("scheduleCleanupTask should call scheduler SDK with the correct parameters", async () => {
    const usedParams: string[] = [];

    vi.doMock("../../utils/authentication-factory.js", () => ({
      getSchedulerSdk: () =>
        Promise.resolve({
          scheduleTasks: (...params: string[]) => {
            usedParams.push(...params);
            return Promise.resolve();
          },
        }),
    }));

    vi.doMock("../../utils/storeConfig.js", () => ({
      SCHEDULER_TOKEN,
      getConfigValue: () => Promise.resolve("token"),
      claimNextRun: () => Promise.resolve(true),
      releaseNextRun: () => Promise.resolve(),
    }));

    const { default: scheduleCleanupTask } = await import(
      "../../utils/scheduleCleanupTask.js"
    );

    const app = {
      pg: {
        pool: {},
      },
      log: { info: () => {}, error: () => {} },
      config: {
        SCHEDULED_JOBS_HOURS_INTERVAL: 5,
        HOST: "http://foo.com",
      },
    } as unknown as FastifyInstance;
    await scheduleCleanupTask(app);

    expect(usedParams[0]).toMatchObject([
      {
        executeAt: new OriginalDate(
          OriginalDate.UTC(2024, 0, 1, 5, 0, 0),
        ).toISOString(),
        webhookUrl: `http://foo.com/api/v1/jobs`,
        webhookAuth: "token",
      },
    ]);
  });

  it("scheduleCleanupTask errors should be logged when schedulerSdk throws", async () => {
    const usedParams: string[] = [];

    vi.doMock("../../utils/authentication-factory.js", () => ({
      getSchedulerSdk: () =>
        Promise.resolve({
          scheduleTasks: (...params: string[]) => {
            usedParams.push(...params);
            return Promise.reject("error");
          },
        }),
    }));

    vi.doMock("../../utils/storeConfig.js", () => ({
      SCHEDULER_TOKEN,
      getConfigValue: () => Promise.resolve("token"),
      claimNextRun: () => Promise.resolve(true),
      releaseNextRun: () => Promise.resolve(),
    }));

    const { default: scheduleCleanupTask } = await import(
      "../../utils/scheduleCleanupTask.js"
    );

    let errorLogged = false;
    const app = {
      pg: {
        pool: {},
      },
      log: {
        info: () => {},
        error: () => {
          errorLogged = true;
        },
      },
      config: {
        SCHEDULED_JOBS_HOURS_INTERVAL: 5,
        HOST: "http://foo.com",
      },
    } as unknown as FastifyInstance;
    await scheduleCleanupTask(app);

    expect(usedParams[0]).toMatchObject([
      {
        executeAt: new OriginalDate(
          OriginalDate.UTC(2024, 0, 1, 5, 0, 0),
        ).toISOString(),
        webhookUrl: `http://foo.com/api/v1/jobs`,
        webhookAuth: "token",
      },
    ]);

    expect(errorLogged).toBe(true);
  });

  it("scheduleCleanupTask builds webhook URL without a double slash when HOST has a trailing slash", async () => {
    const usedParams: string[] = [];

    vi.doMock("../../utils/authentication-factory.js", () => ({
      getSchedulerSdk: () =>
        Promise.resolve({
          scheduleTasks: (...params: string[]) => {
            usedParams.push(...params);
            return Promise.resolve();
          },
        }),
    }));

    vi.doMock("../../utils/storeConfig.js", () => ({
      SCHEDULER_TOKEN,
      getConfigValue: () => Promise.resolve("token"),
      claimNextRun: () => Promise.resolve(true),
      releaseNextRun: () => Promise.resolve(),
    }));

    const { default: scheduleCleanupTask } = await import(
      "../../utils/scheduleCleanupTask.js"
    );

    const app = {
      pg: { pool: {} },
      log: { info: () => {}, error: () => {} },
      config: {
        SCHEDULED_JOBS_HOURS_INTERVAL: 5,
        HOST: "http://foo.com/",
      },
    } as unknown as FastifyInstance;
    await scheduleCleanupTask(app);

    expect(usedParams[0]).toMatchObject([
      {
        webhookUrl: "http://foo.com/api/v1/jobs",
        webhookAuth: "token",
      },
    ]);
  });

  it("scheduleCleanupTask should not schedule when a run is already claimed", async () => {
    const usedParams: string[] = [];

    vi.doMock("../../utils/authentication-factory.js", () => ({
      getSchedulerSdk: () =>
        Promise.resolve({
          scheduleTasks: (...params: string[]) => {
            usedParams.push(...params);
            return Promise.resolve();
          },
        }),
    }));

    vi.doMock("../../utils/storeConfig.js", () => ({
      SCHEDULER_TOKEN,
      getConfigValue: () => Promise.resolve("token"),
      claimNextRun: () => Promise.resolve(false),
      releaseNextRun: () => Promise.resolve(),
    }));

    const { default: scheduleCleanupTask } = await import(
      "../../utils/scheduleCleanupTask.js"
    );

    const app = {
      pg: { pool: {} },
      log: { info: () => {}, error: () => {} },
      config: {
        SCHEDULED_JOBS_HOURS_INTERVAL: 5,
        HOST: "http://foo.com",
      },
    } as unknown as FastifyInstance;
    await scheduleCleanupTask(app);

    expect(usedParams).toHaveLength(0);
  });

  it("scheduleCleanupTask should release the claim when scheduling fails", async () => {
    let released = false;

    vi.doMock("../../utils/authentication-factory.js", () => ({
      getSchedulerSdk: () =>
        Promise.resolve({
          scheduleTasks: () => Promise.reject("error"),
        }),
    }));

    vi.doMock("../../utils/storeConfig.js", () => ({
      SCHEDULER_TOKEN,
      getConfigValue: () => Promise.resolve("token"),
      claimNextRun: () => Promise.resolve(true),
      releaseNextRun: () => {
        released = true;
        return Promise.resolve();
      },
    }));

    const { default: scheduleCleanupTask } = await import(
      "../../utils/scheduleCleanupTask.js"
    );

    const app = {
      pg: { pool: {} },
      log: { info: () => {}, error: () => {} },
      config: {
        SCHEDULED_JOBS_HOURS_INTERVAL: 5,
        HOST: "http://foo.com",
      },
    } as unknown as FastifyInstance;
    await scheduleCleanupTask(app);

    expect(released).toBe(true);
  });
});
