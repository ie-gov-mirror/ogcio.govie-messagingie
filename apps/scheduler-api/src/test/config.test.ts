import { describe, expect, it } from "vitest";
import { envSchema } from "../config.js";

describe("envSchema", () => {
  it("requires the database and logto settings", () => {
    expect(envSchema.required).toEqual(
      expect.arrayContaining([
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_HOST",
        "POSTGRES_PORT",
        "POSTGRES_DB_NAME",
        "LOGTO_OIDC_ENDPOINT",
        "LOGTO_JWK_ENDPOINT",
        "LOGTO_API_RESOURCE_INDICATOR",
        "LOG_LEVEL",
      ]),
    );
  });

  it("defaults LOG_LEVEL and POSTGRES_SSL", () => {
    expect(envSchema.properties.LOG_LEVEL.default).toBe("debug");
    expect(envSchema.properties.POSTGRES_SSL.default).toBe(false);
  });
});
