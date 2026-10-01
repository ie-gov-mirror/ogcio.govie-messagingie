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

vi.mock("../../../routes/index.js", () => ({
  default: async () => {},
}));

const releaseMock = vi.fn();
vi.mock("@fastify/postgres", () => ({
  default: fp(async (fastify: FastifyInstance) => {
    fastify.decorate("pg", {
      pool: {
        connect: () => Promise.resolve({ release: releaseMock }),
      },
    } as unknown as FastifyInstance["pg"]);
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

const getOrganizationFilesMock = vi.fn();
const getSharedFilesMock = vi.fn();
vi.mock("../../../routes/metadata/utils/filesMetadata.js", () => ({
  getOrganizationFiles: (...args: unknown[]) =>
    getOrganizationFilesMock(...args),
  getSharedFiles: (...args: unknown[]) => getSharedFilesMock(...args),
}));

const fileMetadata = {
  fileName: "file.txt",
  id: "file-1",
  key: "user/file-1",
  ownerId: "user",
  fileSize: 100,
  mimeType: "text/plain",
  createdAt: "2024-01-01T00:00:00.000Z",
  lastScan: "2024-01-01T00:00:00.000Z",
  deleted: false,
  infected: false,
  antivirusDbVersion: "1",
  expiresAt: "2024-06-01T00:00:00.000Z",
};

describe("metadata support routes", async () => {
  let app: FastifyInstance;
  let isM2MApplication = true;

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/metadata/support.js");

  beforeEach(async () => {
    vi.clearAllMocks();
    isM2MApplication = true;

    app = await build();
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
      prefix: "/support/metadata",
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns organization files when organizationId is provided", async () => {
    getOrganizationFilesMock.mockResolvedValue({ rows: [fileMetadata] });

    const response = await app.inject({
      method: "GET",
      url: "/support/metadata?organizationId=org-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(getOrganizationFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
    expect(getSharedFilesMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalled();
  });

  it("returns shared files when only userId is provided", async () => {
    getSharedFilesMock.mockResolvedValue({ rows: [fileMetadata] });

    const response = await app.inject({
      method: "GET",
      url: "/support/metadata?userId=user-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(getSharedFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
    expect(getOrganizationFilesMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalled();
  });

  it("prefers organizationId when both query params are provided", async () => {
    getOrganizationFilesMock.mockResolvedValue({ rows: [] });

    const response = await app.inject({
      method: "GET",
      url: "/support/metadata?organizationId=org-1&userId=user-1",
    });

    expect(response.statusCode).toBe(200);
    expect(getOrganizationFilesMock).toHaveBeenCalled();
    expect(getSharedFilesMock).not.toHaveBeenCalled();
  });

  it("rejects non-M2M callers with 403", async () => {
    isM2MApplication = false;

    const response = await app.inject({
      method: "GET",
      url: "/support/metadata?organizationId=org-1",
    });

    expect(response.statusCode).toBe(403);
    expect(getOrganizationFilesMock).not.toHaveBeenCalled();
  });

  it("rejects requests without query params", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/support/metadata",
    });

    expect(response.statusCode).toBe(422);
  });

  it("returns 500 and releases the client when the query fails", async () => {
    getOrganizationFilesMock.mockRejectedValue(new Error("db down"));

    const response = await app.inject({
      method: "GET",
      url: "/support/metadata?organizationId=org-1",
    });

    expect(response.statusCode).toBe(500);
    expect(releaseMock).toHaveBeenCalled();
  });
});
