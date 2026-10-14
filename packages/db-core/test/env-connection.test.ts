import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  type DbEnv,
  getDbEnv,
  getSslConfig,
  POSTGRES_MAINTENANCE_DB,
  toConnectionString,
} from "../src/env-connection.js";

const fullEnv: Record<string, string> = {
  POSTGRES_USER: "app_user",
  POSTGRES_PASSWORD: "s3cr3t",
  POSTGRES_HOST: "db.example",
  POSTGRES_PORT: "6543",
  POSTGRES_DB_NAME: "app_db",
};

describe("getDbEnv", () => {
  it("reads and coerces the discrete env vars (SSL defaults to false)", () => {
    expect(getDbEnv(fullEnv)).toEqual<DbEnv>({
      POSTGRES_USER: "app_user",
      POSTGRES_PASSWORD: "s3cr3t",
      POSTGRES_HOST: "db.example",
      POSTGRES_PORT: 6543,
      POSTGRES_DB_NAME: "app_db",
      POSTGRES_SSL: false,
    });
  });

  it("coerces POSTGRES_SSL='TRUE' (case-insensitive) to a boolean", () => {
    expect(getDbEnv({ ...fullEnv, POSTGRES_SSL: "TRUE" }).POSTGRES_SSL).toBe(
      true,
    );
    expect(getDbEnv({ ...fullEnv, POSTGRES_SSL: "false" }).POSTGRES_SSL).toBe(
      false,
    );
  });

  it("throws listing every missing required var", () => {
    expect(() =>
      getDbEnv({ POSTGRES_USER: "u", POSTGRES_PORT: "5432" }),
    ).toThrow(/POSTGRES_PASSWORD.*POSTGRES_HOST.*POSTGRES_DB_NAME/);
  });

  it("throws on a non-numeric port", () => {
    expect(() =>
      getDbEnv({ ...fullEnv, POSTGRES_PORT: "not-a-number" }),
    ).toThrow(/Invalid POSTGRES_PORT/);
  });
});

describe("toConnectionString", () => {
  it("builds a postgresql:// url and URL-encodes credentials", () => {
    const env = getDbEnv({ ...fullEnv, POSTGRES_PASSWORD: "p@ss:word/!" });
    expect(toConnectionString(env)).toBe(
      "postgresql://app_user:p%40ss%3Aword%2F!@db.example:6543/app_db",
    );
  });
});

describe("getSslConfig", () => {
  const dir = mkdtempSync(join(tmpdir(), "db-core-ssl-"));
  const caPath = join(dir, "ca.pem");
  writeFileSync(caPath, "FAKE CA BUNDLE");

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("returns false when SSL is off", () => {
    expect(getSslConfig(false)).toBe(false);
    expect(getSslConfig(undefined)).toBe(false);
  });

  it("reads the CA bundle when SSL is on", () => {
    const ssl = getSslConfig(true, { caCertPath: caPath });
    expect(ssl).toMatchObject({ rejectUnauthorized: false });
    expect((ssl as { ca: Buffer }).ca.toString()).toBe("FAKE CA BUNDLE");
  });

  it("throws when SSL is on but no caCertPath is supplied", () => {
    expect(() => getSslConfig(true)).toThrow(/caCertPath is required/);
  });
});

describe("POSTGRES_MAINTENANCE_DB", () => {
  it("is the standard postgres maintenance database", () => {
    expect(POSTGRES_MAINTENANCE_DB).toBe("postgres");
  });
});
