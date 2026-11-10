import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoConfig } from "../../plugins/external/pg.js";

describe("pg autoConfig ssl", () => {
  const previous = process.env.DATABASE_TEST_URL;
  beforeEach(() => {
    delete process.env.DATABASE_TEST_URL;
  });
  afterEach(() => {
    if (previous !== undefined) {
      process.env.DATABASE_TEST_URL = previous;
    }
  });

  it("verifies the server certificate against the bundled CA", () => {
    const config = autoConfig({
      config: { POSTGRES_SSL: true },
      dirname: path.resolve(import.meta.dirname, "../.."),
    } as unknown as FastifyInstance);

    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((config.ssl as { ca: Buffer }).ca.length).toBeGreaterThan(0);
  });
});
