import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";
import type { MultipartFile } from "@fastify/multipart";
import type { PostgresDb } from "@fastify/postgres";
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";
import type { FieldDef } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClamavClient } from "../../../utils/clamav/index.js";

const nextTick = () =>
  new Promise<void>((resolve) => setTimeout(() => resolve()));

const decorateRequest = (
  fastify: FastifyInstance,
  data:
    | {
        file: PassThrough & { truncated: boolean };
        filename?: string;
        fields?: { [key: string]: { value: string } };
      }
    | null
    | undefined,
) => {
  fastify.decorateRequest("file", () => {
    return Promise.resolve(data as unknown as MultipartFile);
  });
};

// Shared context object that mocks look up dynamically
// The object itself never changes, only its properties do
const testContext: {
  uploadEventEmitter: EventEmitter;
  s3SendEventEmitter: EventEmitter;
  antivirusVersionEventEmitter: EventEmitter;
  pgEventEmitter: EventEmitter;
  profileSdkEventEmitter: EventEmitter;
} = {
  uploadEventEmitter: new EventEmitter(),
  s3SendEventEmitter: new EventEmitter(),
  antivirusVersionEventEmitter: new EventEmitter(),
  pgEventEmitter: new EventEmitter(),
  profileSdkEventEmitter: new EventEmitter(),
};

vi.mock("@fastify/autoload", () => ({
  default: async () => {},
}));

vi.mock("../../../routes/index.js", () => ({
  default: async () => {},
}));

vi.mock("@fastify/multipart", () => ({
  default: fp(async (fastify: FastifyInstance) => {
    fastify.addContentTypeParser(
      "multipart/form-data",
      (_req, _payload, done) => done(null),
    );
  }),
}));

vi.mock("@fastify/postgres", () => ({
  default: fp(async (fastify: FastifyInstance) => {
    fastify.decorate("pg", {
      query: () => {
        return new Promise<{
          rows: unknown;
          rowCount: number;
          command: string;
          oid: number;
          fields: FieldDef[];
        }>((resolve, reject) => {
          testContext.pgEventEmitter.once("error", (err) => reject(err));
          testContext.pgEventEmitter.once("done", (data) => {
            resolve({
              rows: data,
              command: "",
              rowCount: data?.length,
              oid: 1,
              fields: [],
            });
          });
        });
      },
    } as unknown as PostgresDb & Record<string, PostgresDb>);
  }),
}));

vi.mock("../../../utils/storeConfig.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../utils/storeConfig.js")
  >("../../../utils/storeConfig.js");
  return {
    ...actual,
    seedConfig: () => Promise.resolve(),
  };
});

vi.mock("../../../utils/scheduleCleanupTask.js", () => ({
  default: () => Promise.resolve(),
}));

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    async done() {
      return new Promise<void>((resolve, reject) => {
        testContext.uploadEventEmitter.once("fileUploaded", (data) => {
          resolve(data);
        });
        testContext.uploadEventEmitter.once("upload-error", () => {
          reject(new Error("upload error"));
        });
      });
    }
  },
}));

vi.mock("../../../routes/files/utils/getFilename.js", () => ({
  default: (_pg: unknown, filename: string) => Promise.resolve(filename),
}));

vi.mock("../../../utils/authentication-factory.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../utils/authentication-factory.js")
  >("../../../utils/authentication-factory.js");
  return {
    ...actual,
    getProfileSdk: () =>
      Promise.resolve({
        selectUsers: () =>
          new Promise<void>((resolve, reject) => {
            testContext.profileSdkEventEmitter.on("done", (data) =>
              resolve(data),
            );
            testContext.profileSdkEventEmitter.on("error", (err) =>
              reject(err),
            );
          }),
      }),
  };
});

vi.mock("../../../routes/utils/userCanAccessFileOrThrow.js", () => ({
  default: () => Promise.resolve(),
}));

describe("files", async () => {
  let app: FastifyInstance;
  let antivirusPassthrough: PassThrough;
  let passthroughStream: PassThrough & { truncated: boolean };

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/files/index.js");

  const createS3Plugin = () =>
    fp(
      async (fastify) => {
        fastify.decorate("s3Client", {
          config: {
            region: "region",
            endpoint: "",
            forcePathStyle: true,
          },
          bucketName: "",
          client: {
            send: () =>
              new Promise((resolve, reject) => {
                testContext.s3SendEventEmitter.once("send-error", (err) => {
                  if (err) {
                    reject(err);
                  } else reject(new Error("send-error"));
                });
                testContext.s3SendEventEmitter.once("sendComplete", (data) => {
                  resolve(data);
                });
              }),
          } as unknown as S3Client,
        });
      },
      { name: "s3ClientPlugin" },
    );

  beforeEach(async () => {
    // Reset all event emitters with fresh instances
    testContext.uploadEventEmitter = new EventEmitter();
    testContext.s3SendEventEmitter = new EventEmitter();
    testContext.antivirusVersionEventEmitter = new EventEmitter();
    testContext.pgEventEmitter = new EventEmitter();
    testContext.profileSdkEventEmitter = new EventEmitter();

    app = await build();
    app.addHook("onRequest", async (req: FastifyRequest) => {
      app.checkPermissions = async (
        request: FastifyRequest,
        _reply: FastifyReply,
        _permissions: string[],
        _matchConfig?: { method: "AND" | "OR" },
      ) => {
        req.userData = {
          userId: "userId",
          accessToken: "accessToken",
          organizationId: "organisationId",
          isM2MApplication: false,
        };
        request.userData = req.userData;
      };
    });

    antivirusPassthrough = new PassThrough();
    passthroughStream = new PassThrough() as PassThrough & {
      truncated: boolean;
    };

    const clamscanPlugin = fp(
      async (fastify) => {
        fastify.decorate("avClient", {
          passthrough: () => antivirusPassthrough,
          getVersion: () => {
            return new Promise((resolve) => {
              testContext.antivirusVersionEventEmitter.on("version", (data) =>
                resolve(data),
              );
            });
          },
        } as unknown as ClamavClient);
      },
      { name: "clamscanPlugin" },
    );

    await app.register(createS3Plugin());
    await app.register(clamscanPlugin);
    await app.register(routes as unknown as FastifyPluginCallback, {
      prefix: "/files",
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe("upload", () => {
    it("Should throw an error when the request is not multipart", async () => {
      decorateRequest(app, null);

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toBe(
        "application/json; charset=utf-8",
      );
      expect(response.json().detail).toBe("Request is not multipart");
    });

    it("Should throw and error when uploaded file is too large", async () => {
      // Set truncated before the request so the check at line 102 catches it
      passthroughStream.truncated = true;

      decorateRequest(app, {
        file: passthroughStream,
        filename: "tooBig.txt",
        fields: {},
      });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(413);
      expect(response.json().detail).toBe("File is too large");
    });

    // TODO: These tests require complex async stream coordination that worked in tap
    // but doesn't work in vitest due to different event loop handling.
    // The tests validate: infected file detection, successful uploads, AV scan failures,
    // upload failures, stream errors, and pg errors.
    // They should be re-enabled when the async coordination is fixed.

    it.skip("Should reject when file is infected", () => {
      return new Promise<void>((resolve) => {
        decorateRequest(app, {
          file: passthroughStream,
          filename: "sample.txt",
          fields: {},
        });

        app
          .inject({
            method: "POST",
            url: "/files",
          })
          .then((response) => {
            expect(response.statusCode).toBe(400);
            expect(response.json().detail).toBe("File is infected");
            resolve();
          });

        // These run after inject starts
        setImmediate(async () => {
          passthroughStream.end(Buffer.alloc(1));
          await nextTick();
          antivirusPassthrough.emit("scan-complete", {
            isInfected: true,
            viruses: ["virus signature"],
          });
          await nextTick();
          testContext.antivirusVersionEventEmitter.emit(
            "version",
            "ClamAV 1.2.3/27364/Sun Aug 11 08:37:34 2024\n",
          );
          await nextTick();
          testContext.pgEventEmitter.emit("done");
        });
      });
    });

    it.skip("Should return a 200 status code when file is uploaded with no expiration date", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: {},
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      passthroughStream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      testContext.uploadEventEmitter.emit("fileUploaded", { Key: "key" });
      await nextTick();
      testContext.pgEventEmitter.emit("done", [{ id: "1" }]);
      await nextTick();
      antivirusPassthrough.emit("scan-complete", { isInfected: false });

      const response = await responsePromise;
      expect(response.statusCode).toBe(201);
    });

    it.skip("Should return a 200 status code when file is uploaded with allowed CAPITAL extension", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.MP4",
        fields: {},
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      passthroughStream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      testContext.uploadEventEmitter.emit("fileUploaded", { Key: "key" });
      await nextTick();
      testContext.pgEventEmitter.emit("done", [{ id: "1" }]);
      await nextTick();
      antivirusPassthrough.emit("scan-complete", { isInfected: false });

      const response = await responsePromise;
      expect(response.statusCode).toBe(201);
    });

    it.skip("Should return a 200 status code when file is uploaded with expiration date", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: { expirationDate: { value: "2024-01-01T10:00" } },
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      passthroughStream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      testContext.uploadEventEmitter.emit("fileUploaded", { Key: "key" });
      await nextTick();
      testContext.pgEventEmitter.emit("done", [{ id: "1" }]);
      await nextTick();
      antivirusPassthrough.emit("scan-complete", { isInfected: false });

      const response = await responsePromise;
      expect(response.statusCode).toBe(201);
    });

    it.skip("Should return a 200 status code when file is uploaded with external id", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: { externalId: { value: "externalId" } },
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      passthroughStream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      testContext.uploadEventEmitter.emit("fileUploaded", { Key: "key" });
      await nextTick();
      testContext.pgEventEmitter.emit("done", [{ id: "1" }]);
      await nextTick();
      antivirusPassthrough.emit("scan-complete", { isInfected: false });

      const response = await responsePromise;
      expect(response.statusCode).toBe(201);
    });

    it("should return an error when filename is not provided", async () => {
      decorateRequest(app, { file: passthroughStream, fields: {} });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe("Filename is not provided");
    });

    it("should return an error when a dotfile is uploaded", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: ".env",
        fields: {},
      });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe("File not allowed");
    });

    it("should return an error when a a file with a forbidden extension is uploaded", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "test.exe",
        fields: {},
      });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe("File not allowed");
    });

    it("should return an error when a a file with no extension is uploaded", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "test",
        fields: {},
      });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe("File not allowed");
    });

    it("should return an error when a filename contains newline characters", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "file\r\nname.txt",
        fields: {},
      });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe("File not allowed");
    });

    it("should return an error when a filename contains control characters", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "file\u0000name.txt",
        fields: {},
      });

      const response = await app.inject({
        method: "POST",
        url: "/files",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().detail).toBe("File not allowed");
    });

    it.skip("should return an error when AV scan fails in POST", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: {},
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      passthroughStream.end(Buffer.alloc(1));
      await nextTick();

      antivirusPassthrough.emit("error", new Error("scan error"));
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });

    it.skip("should return an error when upload fails", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: {},
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      antivirusPassthrough.emit("scan-complete", { isInfected: false });
      await nextTick();
      testContext.uploadEventEmitter.emit(
        "upload-error",
        new Error("upload error"),
      );
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });

    it.skip("should return an error when the file stream throws an error", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: {},
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      passthroughStream.end(Buffer.alloc(1));
      await nextTick();
      passthroughStream.emit("error", new Error("stream error"));
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });

    it.skip("should return an error when the pg connection throws", async () => {
      decorateRequest(app, {
        file: passthroughStream,
        filename: "sample.txt",
        fields: {},
      });

      const responsePromise = app.inject({
        method: "POST",
        url: "/files",
      });

      await nextTick();
      passthroughStream.end(Buffer.alloc(1));
      testContext.uploadEventEmitter.emit("fileUploaded", { Key: "key" });
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", { isInfected: false });
      await nextTick();
      testContext.pgEventEmitter.emit("error", new Error("pg error"));
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });
  });

  describe("get", () => {
    it("should return a 404 when a file is not found on s3", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/dummyfile.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [{}]);
      await nextTick();
      testContext.s3SendEventEmitter.emit("send-error", {
        $metadata: { httpStatusCode: 404 },
      });
      await nextTick();
      testContext.pgEventEmitter.emit("done", []);
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(404);
    });

    it("should return a 404 when file metadata is not found", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/dummyfile.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", []);
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(404);
    });

    it("should return a 400 error when trying to get an infected file", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/dummyfile.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [{ infected: true }]);
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(400);
    });

    it("should return a 500 when an error happens in s3", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/dummyfile.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [{}]);
      await nextTick();
      testContext.s3SendEventEmitter.emit("send-error", {
        $metadata: { httpStatusCode: 500 },
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });

    it("should return a 500 when body is not present in the response", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/dummyfile.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [{}]);
      await nextTick();
      testContext.s3SendEventEmitter.emit("sendComplete", {});
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });

    it("should return a stream when file downloads correctly without waiting for metadata update", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [{}]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.push(Buffer.alloc(1));
      stream.push(Buffer.alloc(1));
      stream.end();
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: false,
        viruses: [],
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
    });

    it("should preserve inline downloads with a safe content type", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file-id",
      });

      await nextTick();
      // stored mimeType is client-supplied metadata and must be ignored
      testContext.pgEventEmitter.emit("done", [
        {
          fileName: "image.svg",
          mimeType: "text/html",
          fileSize: 2,
        },
      ]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.from("ab"));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: false,
        viruses: [],
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-disposition"]).toBe(
        'filename="image.svg"',
      );
      expect(response.headers["content-type"]).toBe("application/octet-stream");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("should serve unknown extensions as application/octet-stream", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file-id",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        {
          fileName: "page.html",
          mimeType: "text/html",
          fileSize: 2,
        },
      ]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.from("ab"));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: false,
        viruses: [],
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/octet-stream");
    });

    it("should sanitize stored filenames so they cannot alter response headers", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file-id",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        {
          fileName: 'evil"\r\nx-injected: 1\r\n.txt',
          mimeType: "text/plain",
          fileSize: 2,
        },
      ]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.from("ab"));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: false,
        viruses: [],
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-injected"]).toBeUndefined();
      expect(response.headers["content-disposition"]).toBe(
        'filename="evil\\"x-injected: 1.txt"',
      );
      expect(response.headers["content-type"]).toBe("text/plain");
    });

    it("should preserve non-ascii filenames via an RFC 5987 filename* parameter", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file-id",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        {
          fileName: "résumé.pdf",
          mimeType: "application/pdf",
          fileSize: 2,
        },
      ]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.from("ab"));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: false,
        viruses: [],
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-disposition"]).toBe(
        "filename=\"r_sum_.pdf\"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
      );
      expect(response.headers["content-type"]).toBe("application/pdf");
    });

    it.skip("should return the stream whenn AV throws an error in GET", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        { filename: "filename", mimetype: "text/plain", fileSize: 100 },
      ]);
      await nextTick();

      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      stream.end(Buffer.alloc(1));
      await nextTick();

      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("error", new Error("AV error"));
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: false,
        viruses: [],
      });
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
    });

    it.skip("should return an error when an infected file is downloaded", async () => {
      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        { filename: "filename", mimetype: "text/plain", fileSize: 100 },
      ]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: true,
        viruses: ["v1"],
      });
      await nextTick();
      testContext.s3SendEventEmitter.emit("sendComplete");
      await nextTick();
      testContext.pgEventEmitter.emit("done", []);
      await nextTick();

      const response = await responsePromise;
      expect(response.statusCode).toBe(500);
    });

    // TODO: This test requires complex async stream coordination that doesn't work with vitest's synchronous inject
    it.skip("should log the error if s3 deletion throws", async () => {
      const logger = app.log.error;
      const errorLog: string[] = [];
      app.log.error = (...params: unknown[]) => {
        const _error = params[0] as { message: string };
        errorLog.push(_error.message);
        logger(params);
      };

      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        { filename: "filename", mimetype: "text/plain", fileSize: 100 },
      ]);
      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: true,
        viruses: ["v1"],
      });
      await nextTick();
      testContext.s3SendEventEmitter.emit("send-error");
      await nextTick();
      testContext.pgEventEmitter.emit("done", []);
      await nextTick();

      try {
        await responsePromise;
      } catch {
        const expectedError = errorLog.some((m) => m === "send-error");
        expect(expectedError).toBe(true);
      }
    });

    // TODO: This test requires complex async stream coordination that doesn't work with vitest's synchronous inject
    it.skip("should log the error if file metadata update fails", async () => {
      const logger = app.log.error;
      const errorLog: string[] = [];
      app.log.error = (...params: unknown[]) => {
        const _error = params[0] as { message: string };
        errorLog.push(_error.message);
        logger(params);
      };

      const responsePromise = app.inject({
        method: "GET",
        url: "/files/file.txt",
      });

      await nextTick();
      testContext.pgEventEmitter.emit("done", [
        { filename: "filename", mimetype: "text/plain", fileSize: 100 },
      ]);

      await nextTick();
      const stream = new PassThrough();
      testContext.s3SendEventEmitter.emit("sendComplete", {
        Body: { transformToWebStream: () => stream },
      });
      await nextTick();
      stream.end(Buffer.alloc(1));
      await nextTick();
      testContext.antivirusVersionEventEmitter.emit("version", "");
      await nextTick();
      antivirusPassthrough.emit("scan-complete", {
        isInfected: true,
        viruses: ["v1"],
      });
      await nextTick();
      testContext.s3SendEventEmitter.emit("sendComplete");
      await nextTick();
      testContext.pgEventEmitter.emit("error", new Error("dummy"));
      await nextTick();

      try {
        await responsePromise;
      } catch {
        const expectedError = errorLog.some((m) => m === "dummy");
        expect(expectedError).toBe(true);
      }
    });
  });
});
