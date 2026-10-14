import { describe, expect, it } from "vitest";
import {
  createDatabaseIfNotExists,
  dropDatabase,
} from "../src/create-drop-db.js";
import type { DbEnv } from "../src/env-connection.js";

// These guards run before any connection is opened, so they can be asserted
// without a live database.
const envWith = (dbName: string): DbEnv => ({
  POSTGRES_USER: "u",
  POSTGRES_PASSWORD: "p",
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: 5432,
  POSTGRES_DB_NAME: dbName,
});

describe("dropDatabase guards", () => {
  it("refuses to drop the maintenance database", async () => {
    await expect(dropDatabase(envWith("postgres"))).rejects.toThrow(
      /can't drop postgres/,
    );
  });

  it("rejects a database name outside the identifier whitelist", async () => {
    await expect(
      dropDatabase(envWith("app; DROP TABLE users")),
    ).rejects.toThrow(/Invalid database name/);
    await expect(dropDatabase(envWith("app-db"))).rejects.toThrow(
      /Invalid database name/,
    );
  });
});

describe("createDatabaseIfNotExists guards", () => {
  it("rejects a database name outside the identifier whitelist", async () => {
    await expect(
      createDatabaseIfNotExists(envWith('bad"name')),
    ).rejects.toThrow(/Invalid database name/);
  });
});
