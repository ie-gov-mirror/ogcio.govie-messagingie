import { Pool, type PoolConfig } from "pg";
import { describe, expect, it } from "vitest";
import { createPool } from "../src/db.js";

// node-postgres keeps the resolved config on `pool.options`, which lets us
// assert how `createPool` mapped the DbCoreConfig without opening a connection.
const optionsOf = (pool: Pool): PoolConfig =>
  (pool as unknown as { options: PoolConfig }).options;

describe("createPool", () => {
  it("builds a pool from discrete host/port/user fields", async () => {
    const pool = createPool({
      host: "db.example",
      port: 6543,
      user: "app_user",
      password: "secret",
      database: "app_db",
    });

    expect(pool).toBeInstanceOf(Pool);
    const options = optionsOf(pool);
    expect(options.host).toBe("db.example");
    expect(options.port).toBe(6543);
    expect(options.user).toBe("app_user");
    expect(options.database).toBe("app_db");
    expect(options.connectionString).toBeUndefined();

    await pool.end();
  });

  it("defaults ssl to false for discrete fields", async () => {
    const pool = createPool({ host: "localhost" });
    expect(optionsOf(pool).ssl).toBe(false);
    await pool.end();
  });

  it("defaults ssl to false for a connection string", async () => {
    const pool = createPool({
      connectionString: "postgres://u:p@localhost:5432/db",
    });
    const options = optionsOf(pool);
    expect(options.connectionString).toBe("postgres://u:p@localhost:5432/db");
    expect(options.ssl).toBe(false);
    await pool.end();
  });

  it("passes an explicit ssl setting through unchanged", async () => {
    const pool = createPool({
      host: "localhost",
      ssl: { rejectUnauthorized: false },
    });
    expect(optionsOf(pool).ssl).toEqual({ rejectUnauthorized: false });
    await pool.end();
  });
});
