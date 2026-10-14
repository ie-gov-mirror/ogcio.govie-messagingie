import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import Fastify from "fastify";
import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fastifyKysely } from "../src/fastify-kysely.js";

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
}, 120_000);

afterAll(async () => {
  await container?.stop();
});

const dbOf = (app: { db?: unknown }): Kysely<unknown> =>
  app.db as Kysely<unknown>;

describe("fastifyKysely", () => {
  it("decorates the instance with a working db and disposes the pool on close", async () => {
    const app = Fastify();
    await app.register(fastifyKysely, {
      connectionString: container.getConnectionUri(),
    });
    await app.ready();

    const db = dbOf(app);
    const result = await sql<{ one: number }>`SELECT 1 AS one`.execute(db);
    expect(result.rows[0]?.one).toBe(1);

    await app.close();

    // Closing owns and destroys the pool, so further queries must fail.
    await expect(sql`SELECT 1`.execute(db)).rejects.toThrow();
  });

  it("supports a custom decorator name", async () => {
    const app = Fastify();
    await app.register(fastifyKysely, {
      connectionString: container.getConnectionUri(),
      decoratorName: "readDb",
    });
    await app.ready();

    const db = (app as unknown as { readDb: Kysely<unknown> }).readDb;
    const result = await sql<{ two: number }>`SELECT 2 AS two`.execute(db);
    expect(result.rows[0]?.two).toBe(2);

    await app.close();
  });
});
