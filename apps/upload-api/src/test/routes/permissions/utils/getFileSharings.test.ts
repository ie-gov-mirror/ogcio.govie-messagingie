import type { PostgresDb } from "@fastify/postgres";
import { describe, expect, it } from "vitest";
import getFileSharings from "../../../../routes/permissions/utils/getFileSharings.js";

describe("getFileSharings", () => {
  it("executes query with correct params", async () => {
    // `getFileSharings` now delegates to SharingService, which reads via a
    // Kysely instance built from `pg.pool`; Kysely calls
    // `client.query(sql, parameters)`, so the bound parameters remain the
    // second positional argument.
    const params: unknown[] = [];
    const pg = {
      pool: {
        connect: () =>
          Promise.resolve({
            query: (...args: unknown[]) => {
              params.push(...args);
              return Promise.resolve({ rows: [] });
            },
            release: () => {},
          }),
      },
    };
    await getFileSharings(pg as unknown as PostgresDb, "fileId");
    expect(params[1]).toMatchObject(["fileId"]);
  });
});
