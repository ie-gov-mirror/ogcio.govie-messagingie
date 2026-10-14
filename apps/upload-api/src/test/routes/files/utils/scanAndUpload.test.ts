import { PassThrough } from "node:stream";
import type fastifyPostgres from "@fastify/postgres";
import { httpErrors } from "@fastify/sensible";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

// Mock the S3 multipart upload so `done()` resolves without network I/O.
// The real stream pipelines (request stream -> av passthrough / s3
// passthrough) still run against in-memory PassThrough streams.
vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    private params: { Key: string };
    constructor(opts: {
      params: { Key: string; Body?: NodeJS.ReadableStream };
    }) {
      this.params = opts.params;
      // The real Upload consumes Body (handling its 'error' events). The
      // production abort path destroys Body with an error, so without a
      // listener that surfaces as an unhandled 'error' event.
      opts.params.Body?.on("error", () => {});
    }
    done() {
      return Promise.resolve({ Key: this.params.Key });
    }
  },
}));

import { processUpload } from "../../../../routes/files/utils/scanAndUpload.js";

const AV_DB_VERSION = "27364";

const nextTick = () =>
  new Promise<void>((resolve) => setImmediate(() => resolve()));

const fakeLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

type UploadStream = PassThrough & { truncated: boolean };

const buildUploadStream = (): UploadStream => {
  const stream = new PassThrough() as UploadStream;
  stream.truncated = false;
  // Production code destroys this stream with the original error on abort
  // paths; without a listener the resulting 'error' event would surface as
  // an unhandled error and fail the run.
  stream.on("error", () => {});
  return stream;
};

const buildTestBed = ({
  data,
  insertedId = "inserted-file-id",
}: {
  data:
    | {
        file: UploadStream;
        filename?: string;
        fields?: Record<string, { value: string } | string>;
        mimetype?: string;
      }
    | null
    | undefined;
  insertedId?: string;
}) => {
  const avPassthrough = new PassThrough();
  // Swallow destroy(err) coming from production abort paths (see
  // buildUploadStream) so it does not surface as an unhandled error.
  avPassthrough.on("error", () => {});
  const s3Send = vi.fn().mockResolvedValue({});
  const pgQuery = vi.fn((sql: string) => {
    if (sql.includes("INSERT INTO files")) {
      return Promise.resolve({ rows: [{ id: insertedId }] });
    }
    // getFilename clash check: no clash
    return Promise.resolve({ rows: [] });
  });

  const app = {
    httpErrors,
    pg: {
      query: pgQuery,
      pool: {
        connect: () => Promise.resolve({ query: pgQuery, release: () => {} }),
      },
    } as unknown as fastifyPostgres.PostgresDb,
    s3Client: { client: { send: s3Send }, bucketName: "test-bucket" },
    avClient: {
      passthrough: vi.fn(() => avPassthrough),
      getVersion: vi
        .fn()
        .mockResolvedValue(`ClamAV 1.2.3/${AV_DB_VERSION}/Sun Aug 11 2024`),
    },
    nodeCache: undefined,
    config: { S3_CHUNK_SIZE_MB: 5, S3_CHUNKS_NUMBER: 4 },
  } as unknown as FastifyInstance;

  const request = {
    file: vi.fn().mockResolvedValue(data),
    userData: { userId: "user-1", organizationId: "org-1" },
    log: fakeLog,
  } as unknown as FastifyRequest;

  return { app, request, avPassthrough, s3Send, pgQuery };
};

describe("processUpload", () => {
  it("rejects when the request is not multipart", async () => {
    const { app, request } = buildTestBed({ data: null });

    await expect(
      processUpload(app, request, { scan: true }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("not multipart"),
    });
  });

  it("rejects with 413 when the file is already truncated", async () => {
    const stream = buildUploadStream();
    stream.truncated = true;
    const { app, request } = buildTestBed({
      data: { file: stream, filename: "big.txt", fields: {} },
    });

    await expect(
      processUpload(app, request, { scan: true }),
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it("rejects when no filename is provided", async () => {
    const { app, request } = buildTestBed({
      data: { file: buildUploadStream(), fields: {} },
    });

    await expect(
      processUpload(app, request, { scan: true }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Filename is not provided"),
    });
  });

  it.each(["malware.exe", ".hidden", "no-extension", "weird.name."])(
    "rejects disallowed filename %s",
    async (filename) => {
      const { app, request } = buildTestBed({
        data: { file: buildUploadStream(), filename, fields: {} },
      });

      await expect(
        processUpload(app, request, { scan: true }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("File not allowed"),
      });
    },
  );

  it("passes custom file size limits to the multipart parser", async () => {
    const { app, request } = buildTestBed({ data: null });

    await expect(
      processUpload(app, request, {
        scan: false,
        customMaxFileSize: 1024,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(request.file).toHaveBeenCalledWith({
      throwFileSizeLimit: true,
      limits: { fileSize: 1024, files: 1 },
    });
  });

  it("uploads and inserts metadata for a clean scanned file", async () => {
    const stream = buildUploadStream();
    const { app, request, avPassthrough, pgQuery } = buildTestBed({
      data: { file: stream, filename: "clean.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: true });

    await nextTick();
    stream.end(Buffer.from("clean content"));
    await nextTick();
    avPassthrough.emit("scan-complete", { isInfected: false, viruses: [] });

    await expect(resultPromise).resolves.toBe("inserted-file-id");

    const insertCall = pgQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO files"),
    );
    expect(insertCall).toBeDefined();
    const values = insertCall?.[1] as unknown[];
    expect(values).toContain("user-1");
    expect(values).toContain("org-1");
    expect(values).toContain(AV_DB_VERSION);
  });

  it("stores expiration date from the multipart fields", async () => {
    const stream = buildUploadStream();
    const { app, request, avPassthrough, pgQuery } = buildTestBed({
      data: {
        file: stream,
        filename: "expiring.txt",
        fields: { expirationDate: { value: "2030-01-01T00:00:00.000Z" } },
      },
    });

    const resultPromise = processUpload(app, request, { scan: true });

    await nextTick();
    stream.end(Buffer.from("content"));
    await nextTick();
    avPassthrough.emit("scan-complete", { isInfected: false, viruses: [] });

    await resultPromise;

    const insertCall = pgQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO files"),
    );
    expect(insertCall?.[0]).toContain("expires_at");
    expect(insertCall?.[1]).toContainEqual(
      new Date("2030-01-01T00:00:00.000Z"),
    );
  });

  it("deletes the s3 object, stores metadata and rejects for an infected file", async () => {
    const stream = buildUploadStream();
    const { app, request, avPassthrough, s3Send, pgQuery } = buildTestBed({
      data: { file: stream, filename: "infected.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: true });
    // Attach the rejection expectation immediately to avoid unhandled rejection.
    const assertion = expect(resultPromise).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("File is infected"),
    });

    await nextTick();
    stream.end(Buffer.from("virus content"));
    await nextTick();
    avPassthrough.emit("scan-complete", {
      isInfected: true,
      viruses: ["Eicar-Test-Signature"],
    });

    await assertion;

    // Infected object removed from the bucket.
    expect(s3Send).toHaveBeenCalled();
    // Metadata row stored flagged as infected + deleted.
    const insertCall = pgQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO files"),
    );
    const values = insertCall?.[1] as unknown[];
    expect(values).toContain("Eicar-Test-Signature");
    expect(values).toContain(true); // infected
  });

  it("still stores infected metadata when the s3 delete fails", async () => {
    const stream = buildUploadStream();
    const { app, request, avPassthrough, s3Send, pgQuery } = buildTestBed({
      data: { file: stream, filename: "infected.txt", fields: {} },
    });
    s3Send.mockRejectedValue(new Error("delete failed"));

    const resultPromise = processUpload(app, request, { scan: true });
    const assertion = expect(resultPromise).rejects.toMatchObject({
      statusCode: 400,
    });

    await nextTick();
    stream.end(Buffer.from("virus content"));
    await nextTick();
    avPassthrough.emit("scan-complete", {
      isInfected: true,
      viruses: ["Eicar-Test-Signature"],
    });

    await assertion;

    const insertCall = pgQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO files"),
    );
    expect(insertCall).toBeDefined();
  });

  it("uploads without scanning when scan is disabled", async () => {
    const stream = buildUploadStream();
    const { app, request, pgQuery } = buildTestBed({
      data: { file: stream, filename: "support.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: false });

    await nextTick();
    stream.end(Buffer.from("support content"));

    await expect(resultPromise).resolves.toBe("inserted-file-id");

    const insertCall = pgQuery.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO files"),
    );
    // No scan ran: antivirus db version is not set.
    expect(
      (app.avClient.passthrough as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
    expect(insertCall).toBeDefined();
  });

  it("maps a stream error to a 500 during a scanned upload", async () => {
    const stream = buildUploadStream();
    const { app, request } = buildTestBed({
      data: { file: stream, filename: "broken.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: true });
    const assertion = expect(resultPromise).rejects.toMatchObject({
      statusCode: 500,
      message: "Server error",
    });

    await nextTick();
    stream.destroy(new Error("stream exploded"));

    await assertion;
  });

  it("maps a stream error to a 500 during an unscanned upload", async () => {
    const stream = buildUploadStream();
    const { app, request } = buildTestBed({
      data: { file: stream, filename: "broken.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: false });
    const assertion = expect(resultPromise).rejects.toMatchObject({
      statusCode: 500,
    });

    await nextTick();
    stream.destroy(new Error("stream exploded"));

    await assertion;
  });

  it("rejects with 400 when the file hits the size limit mid-stream (scanned)", async () => {
    const stream = buildUploadStream();
    const { app, request } = buildTestBed({
      data: { file: stream, filename: "toobig.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: true });
    const assertion = expect(resultPromise).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("File is too large"),
    });

    await nextTick();
    stream.truncated = true;
    stream.emit("limit");

    await assertion;
  });

  it("rejects with 400 when the file hits the size limit mid-stream (unscanned)", async () => {
    const stream = buildUploadStream();
    const { app, request } = buildTestBed({
      data: { file: stream, filename: "toobig.txt", fields: {} },
    });

    const resultPromise = processUpload(app, request, { scan: false });
    const assertion = expect(resultPromise).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("File is too large"),
    });

    await nextTick();
    stream.truncated = true;
    stream.emit("limit");

    await assertion;
  });
});
