import { PassThrough } from "node:stream";
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fastify/autoload", () => ({
  default: async () => {},
}));

vi.mock("@fastify/postgres", () => ({
  default: fp(async (fastify: FastifyInstance) => {
    fastify.decorate("pg", {} as FastifyInstance["pg"]);
  }),
}));

vi.mock("../../../routes/index.js", () => ({
  default: async () => {},
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

const processUploadMock = vi.fn();
vi.mock("../../../routes/files/utils/scanAndUpload.js", () => ({
  processUpload: (...args: unknown[]) => processUploadMock(...args),
}));

const userCanAccessMock = vi.fn();
vi.mock("../../../routes/utils/userCanAccessMultipleFilesOrThrow.js", () => ({
  userCanAccessMultipleFilesOrThrow: (...args: unknown[]) =>
    userCanAccessMock(...args),
}));

const downloadMultipleFilesMock = vi.fn();
vi.mock("../../../routes/files/utils/downloadMultipleFiles.js", () => ({
  default: (...args: unknown[]) => downloadMultipleFilesMock(...args),
}));

describe("files support routes", async () => {
  let app: FastifyInstance;
  let isM2MApplication = true;

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/files/support.js");

  beforeEach(async () => {
    vi.clearAllMocks();
    isM2MApplication = true;

    app = await build();
    app.decorate("s3Client", {
      client: {},
      bucketName: "bucket",
    } as FastifyInstance["s3Client"]);
    app.addHook("onRequest", async (req: FastifyRequest) => {
      app.checkPermissions = async (
        request: FastifyRequest,
        _reply: FastifyReply,
        _permissions: string[],
      ) => {
        request.userData = {
          userId: "userId",
          accessToken: "accessToken",
          organizationId: "ogcio",
          isM2MApplication,
          scopes: [],
        };
        req.userData = request.userData;
      };
    });
    await app.register(routes.default as unknown as FastifyPluginCallback, {
      prefix: "/support/files",
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /support/files", () => {
    it("uploads the file and returns its id", async () => {
      processUploadMock.mockResolvedValue("file-id-123");

      const response = await app.inject({
        method: "POST",
        url: "/support/files",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        payload: "",
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ data: { id: "file-id-123" } });
      expect(processUploadMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ scan: false }),
      );
    });

    it("rejects non-M2M callers with 403", async () => {
      isM2MApplication = false;

      const response = await app.inject({
        method: "POST",
        url: "/support/files",
        headers: { "content-type": "multipart/form-data; boundary=x" },
        payload: "",
      });

      expect(response.statusCode).toBe(403);
      expect(processUploadMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /support/files/download-batch", () => {
    const payload = { fileIds: ["file-1"], userId: "target-user" };

    it("streams the files as multipart/mixed", async () => {
      userCanAccessMock.mockResolvedValue(undefined);
      const stream = new PassThrough();
      stream.end("file content");
      downloadMultipleFilesMock.mockResolvedValue({
        stream,
        boundary: "test-boundary",
      });

      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe(
        "multipart/mixed; boundary=test-boundary",
      );
      expect(response.body).toBe("file content");
      expect(userCanAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fileIds: ["file-1"],
          userToCheck: "target-user",
        }),
      );
    });

    it("rejects non-M2M callers with 403", async () => {
      isM2MApplication = false;

      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload,
      });

      expect(response.statusCode).toBe(403);
      expect(downloadMultipleFilesMock).not.toHaveBeenCalled();
    });

    it("returns 404 when a file is not found", async () => {
      userCanAccessMock.mockResolvedValue(undefined);
      downloadMultipleFilesMock.mockRejectedValue(
        new Error("File file-1 not found"),
      );

      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload,
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 400 when a file is infected", async () => {
      userCanAccessMock.mockResolvedValue(undefined);
      downloadMultipleFilesMock.mockRejectedValue(
        new Error("File file-1 is infected"),
      );

      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload,
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 500 on other download errors", async () => {
      userCanAccessMock.mockResolvedValue(undefined);
      downloadMultipleFilesMock.mockRejectedValue(new Error("boom"));

      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload,
      });

      expect(response.statusCode).toBe(500);
    });

    it("propagates access-check failures", async () => {
      userCanAccessMock.mockRejectedValue(
        app.httpErrors.forbidden("no access"),
      );

      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload,
      });

      expect(response.statusCode).toBe(403);
      expect(downloadMultipleFilesMock).not.toHaveBeenCalled();
    });

    it("validates the body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/support/files/download-batch",
        payload: { fileIds: [], userId: "u" },
      });

      expect(response.statusCode).toBe(422);
    });
  });
});
