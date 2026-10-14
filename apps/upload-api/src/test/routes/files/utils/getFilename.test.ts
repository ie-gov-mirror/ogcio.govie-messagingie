import type fastifyPostgres from "@fastify/postgres";
import { describe, expect, it } from "vitest";
import getFilename from "../../../../routes/files/utils/getFilename.js";

describe("getFilename", () => {
  it("should return the provided filename when there is no clash", async () => {
    // `isFilenameAlreadyPresent` now delegates to FileService, which reads via a
    // Kysely instance built from `pg.pool`; Kysely acquires a client through
    // `pool.connect()` and releases it afterwards.
    const pg = {
      pool: {
        connect: () =>
          Promise.resolve({
            query: () => Promise.resolve({ rows: [] }),
            release: () => {},
          }),
      },
    };

    let value = await getFilename(
      pg as unknown as fastifyPostgres.PostgresDb,
      "filename.txt",
      "userId",
    );

    expect(value).toBe("filename.txt");

    value = await getFilename(
      pg as unknown as fastifyPostgres.PostgresDb,
      "filename.prd.txt",
      "userId",
    );

    expect(value).toBe("filename.prd.txt");
  });

  it("should return a suffixed filename when the name clashes", async () => {
    // First lookup (input name) clashes, second (random-suffixed) is free.
    const results = [{ rows: [{ fileName: "filename.txt" }] }, { rows: [] }];
    const pg = {
      pool: {
        connect: () =>
          Promise.resolve({
            query: () => Promise.resolve(results.shift()),
            release: () => {},
          }),
      },
    };

    const value = await getFilename(
      pg as unknown as fastifyPostgres.PostgresDb,
      "filename.txt",
      "userId",
    );

    expect(value).toMatch(/^filename-[0-9a-z]+\.txt$/);
    expect(value).not.toBe("filename.txt");
  });

  it("should retry until a non-clashing filename is found", async () => {
    const results = [
      { rows: [{ fileName: "filename.txt" }] },
      { rows: [{ fileName: "clash-again" }] },
      { rows: [] },
    ];
    const pg = {
      pool: {
        connect: () =>
          Promise.resolve({
            query: () => Promise.resolve(results.shift()),
            release: () => {},
          }),
      },
    };

    const value = await getFilename(
      pg as unknown as fastifyPostgres.PostgresDb,
      "filename.txt",
      "userId",
    );

    expect(value).toMatch(/^filename-[0-9a-z]+\.txt$/);
  });
});
