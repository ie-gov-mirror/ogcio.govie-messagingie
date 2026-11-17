import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED_ENV = {
  POSTGRES_USER: "postgres",
  POSTGRES_PASSWORD: "postgres",
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: "5432",
  POSTGRES_DB_NAME: "scheduler",
  LOGTO_OIDC_ENDPOINT: "https://logto.example/oidc",
  LOGTO_JWK_ENDPOINT: "https://logto.example/oidc/jwks",
  LOGTO_API_RESOURCE_INDICATOR: "https://scheduler.example",
  LOG_LEVEL: "silent",
};

describe("app", () => {
  const savedEnv = { ...process.env };
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, REQUIRED_ENV);
    // The real api-auth plugin talks to logto; it has its own unit tests.
    vi.doMock("../plugins/api-auth.js", () => ({
      default: async () => {},
    }));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = { ...savedEnv };
    vi.doUnmock("../plugins/api-auth.js");
  });

  it("builds a working app exposing health and docs", async () => {
    const { build } = await import("../app.js");
    app = await build();
    await app.ready();

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toHaveProperty("scheduler-api");

    const docs = await app.inject({ method: "GET", url: "/docs" });
    expect([200, 302]).toContain(docs.statusCode);

    expect(app.swagger()).toHaveProperty("openapi");
  });

  it("under pressure handler throws a service unavailable error", async () => {
    let pressureHandler:
      | ((req: null, res: null, type: string, value: string) => void)
      | undefined;

    vi.doMock("@fastify/under-pressure", () => ({
      default: async (
        _fastify: FastifyInstance,
        opts: {
          pressureHandler: (
            req: null,
            res: null,
            type: string,
            value: string,
          ) => void;
        },
      ) => {
        pressureHandler = opts.pressureHandler;
      },
    }));

    const { build } = await import("../app.js");
    app = await build();
    await app.ready();

    expect(pressureHandler).toBeDefined();
    expect(() => pressureHandler?.(null, null, "type", "value")).toThrowError(
      /System is under pressure. Pressure type: type. Pressure value: value/,
    );

    vi.doUnmock("@fastify/under-pressure");
  });
});
