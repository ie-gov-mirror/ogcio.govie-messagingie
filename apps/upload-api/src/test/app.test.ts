import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_TYPE, SCHEDULER_TOKEN } from "../utils/storeConfig.js";

describe("app", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("under pressure handler should throw an error", async () => {
    let pressureHandler = (
      _req: string | null,
      _res: string | null,
      _type: string,
      _value: string,
    ) => {};

    vi.doMock("@fastify/under-pressure", () => ({
      default: async (
        _fastify: FastifyInstance,
        opts: { pressureHandler: () => void },
      ) => {
        pressureHandler = opts.pressureHandler;
      },
    }));

    vi.doMock("@fastify/autoload", () => ({
      default: async () => {},
    }));

    vi.doMock("../utils/storeConfig.js", () => ({
      seedConfig: () => Promise.resolve(),
      CONFIG_TYPE,
      SCHEDULER_TOKEN,
    }));

    vi.doMock("../utils/scheduleCleanupTask.js", () => ({
      default: () => Promise.resolve(),
    }));

    const { build } = await import("../app.js");

    await build();

    expect(() => pressureHandler(null, null, "type", "value")).toThrowError(
      /System is under pressure. Pressure type: type. Pressure value: value/,
    );
  });
});
