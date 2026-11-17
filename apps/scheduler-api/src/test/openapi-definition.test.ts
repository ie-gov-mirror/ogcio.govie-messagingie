import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

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

describe("openapi-definition.yml", () => {
  const savedEnv = { ...process.env };
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, REQUIRED_ENV);
    vi.doMock("../plugins/api-auth.js", () => ({ default: async () => {} }));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = { ...savedEnv };
    vi.doUnmock("../plugins/api-auth.js");
  });

  it("matches the spec the API emits", async () => {
    const { build } = await import("../app.js");
    app = await build();
    await app.ready();
    const committed = await readFile(
      join(import.meta.dirname, "../../openapi-definition.yml"),
      "utf8",
    );
    // Document equality. yaml reflows long plain scalars when line-width
    // accounting changes, which a dependency bump on main already did to the
    // committed files. The contract is the document.
    expect(parse(app.swagger({ yaml: true }))).toEqual(parse(committed));
  });
});
