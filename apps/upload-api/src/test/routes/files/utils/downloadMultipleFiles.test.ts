import type { PassThrough } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";
import type fastifyPostgres from "@fastify/postgres";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import downloadMultipleFiles from "../../../../routes/files/utils/downloadMultipleFiles.js";
import type { ClamavClient } from "../../../../utils/clamav/index.js";

const AV_DB_VERSION = "27364";

const buildLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }) as unknown as FastifyBaseLogger;

const buildFileRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  key: `owner/${id}.txt`,
  ownerId: "owner",
  fileSize: 5,
  mimeType: "text/plain",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  lastScan: new Date("2024-01-01T00:00:00Z"),
  infected: false,
  infectionDescription: undefined,
  fileName: `${id}.txt`,
  antivirusDbVersion: AV_DB_VERSION,
  ...overrides,
});

// The AV client used when file's stored db version matches the current one:
// no passthrough is created at all.
const buildAvClient = () =>
  ({
    getVersion: vi
      .fn()
      .mockResolvedValue(`ClamAV 1.2.3/${AV_DB_VERSION}/Sun Aug 11 2024`),
    passthrough: vi.fn(),
  }) as unknown as ClamavClient;

const buildS3Body = (content: string) => ({
  transformToWebStream: () => {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });
  },
});

const collectStream = (stream: PassThrough): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
    stream.on("error", reject);
  });

const buildParams = ({
  rows,
  send,
  fileIds,
}: {
  rows: ReturnType<typeof buildFileRow>[];
  send?: ReturnType<typeof vi.fn>;
  fileIds: string[];
}) => ({
  fileIds,
  s3Client: { send: send ?? vi.fn() } as unknown as S3Client,
  bucketName: "test-bucket",
  avClient: buildAvClient(),
  pg: {
    pool: {
      connect: () =>
        Promise.resolve({
          query: () => Promise.resolve({ rows }),
          release: () => {},
        }),
    },
  } as unknown as fastifyPostgres.PostgresDb,
  logger: buildLogger(),
});

describe("downloadMultipleFiles", () => {
  it("throws when no file IDs are provided", async () => {
    await expect(
      downloadMultipleFiles(buildParams({ rows: [], fileIds: [] })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws when more than 20 file IDs are requested", async () => {
    const fileIds = Array.from({ length: 21 }, (_, i) => `file-${i}`);
    await expect(
      downloadMultipleFiles(buildParams({ rows: [], fileIds })),
    ).rejects.toThrow("Cannot download more than 20 files at once");
  });

  it("throws 404 when a requested file has no metadata", async () => {
    await expect(
      downloadMultipleFiles(
        buildParams({
          rows: [buildFileRow("file-1")],
          fileIds: ["file-1", "file-2"],
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining("file-2"),
    });
  });

  it("throws 403 when a requested file is infected", async () => {
    await expect(
      downloadMultipleFiles(
        buildParams({
          rows: [buildFileRow("file-1", { infected: true })],
          fileIds: ["file-1"],
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("file-1"),
    });
  });

  it("throws when a metadata row is missing an id", async () => {
    await expect(
      downloadMultipleFiles(
        buildParams({
          rows: [buildFileRow("file-1", { id: undefined })],
          fileIds: ["file-1"],
        }),
      ),
    ).rejects.toThrow("File metadata row is missing an id");
  });

  it("streams a multipart body with headers and file contents", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Body: buildS3Body("hello") })
      .mockResolvedValueOnce({ Body: buildS3Body("world") });

    const { stream, boundary } = await downloadMultipleFiles(
      buildParams({
        rows: [buildFileRow("file-1"), buildFileRow("file-2")],
        send,
        fileIds: ["file-1", "file-2"],
      }),
    );

    const body = await collectStream(stream);

    expect(boundary).toMatch(/[0-9a-f-]{36}/);
    expect(body).toContain(`--${boundary}\r\n`);
    expect(body).toContain(
      'Content-Disposition: attachment; filename="file-1.txt"',
    );
    expect(body).toContain("hello");
    expect(body).toContain(
      'Content-Disposition: attachment; filename="file-2.txt"',
    );
    expect(body).toContain("world");
    expect(body).toContain(`--${boundary}--\r\n`);
  });

  it("skips files that are missing from the bucket", async () => {
    const missingError = Object.assign(new Error("missing"), {
      name: "NoSuchKey",
    });
    const send = vi
      .fn()
      .mockRejectedValueOnce(missingError)
      .mockResolvedValueOnce({ Body: buildS3Body("still here") });

    const params = buildParams({
      rows: [buildFileRow("file-1"), buildFileRow("file-2")],
      send,
      fileIds: ["file-1", "file-2"],
    });
    const { stream } = await downloadMultipleFiles(params);
    const body = await collectStream(stream);

    expect(body).not.toContain("file-1.txt");
    expect(body).toContain("still here");
    expect(params.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1" }),
      expect.stringContaining("not found in bucket"),
    );
  });

  it("skips files whose S3 response has an empty body", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Body: undefined })
      .mockResolvedValueOnce({ Body: buildS3Body("content") });

    const params = buildParams({
      rows: [buildFileRow("file-1"), buildFileRow("file-2")],
      send,
      fileIds: ["file-1", "file-2"],
    });
    const { stream } = await downloadMultipleFiles(params);
    const body = await collectStream(stream);

    expect(body).not.toContain("file-1.txt");
    expect(body).toContain("content");
    expect(params.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1" }),
      expect.stringContaining("body is empty"),
    );
  });

  it("destroys the output stream when S3 fails with an unexpected error", async () => {
    const send = vi.fn().mockRejectedValue(new Error("S3 exploded"));

    const { stream } = await downloadMultipleFiles(
      buildParams({
        rows: [buildFileRow("file-1")],
        send,
        fileIds: ["file-1"],
      }),
    );

    await expect(collectStream(stream)).rejects.toThrow("S3 exploded");
  });

  it("skips a 404-by-status-code S3 error like a missing object", async () => {
    const missingError = Object.assign(new Error("missing"), {
      $metadata: { httpStatusCode: 404 },
    });
    const send = vi.fn().mockRejectedValueOnce(missingError);

    const { stream, boundary } = await downloadMultipleFiles(
      buildParams({
        rows: [buildFileRow("file-1")],
        send,
        fileIds: ["file-1"],
      }),
    );
    const body = await collectStream(stream);

    expect(body).toBe(`--${boundary}--\r\n`);
  });
});
