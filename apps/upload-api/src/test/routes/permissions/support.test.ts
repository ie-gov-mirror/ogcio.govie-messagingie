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

vi.mock("@fastify/postgres", () => ({
  default: fp(async (fastify: FastifyInstance) => {
    fastify.decorate("pg", {} as FastifyInstance["pg"]);
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

const addFileSharingMock = vi.fn();
vi.mock("../../../routes/permissions/utils/addFileSharing.js", () => ({
  default: (...args: unknown[]) => addFileSharingMock(...args),
}));

describe("permissions support routes", async () => {
  let app: FastifyInstance;
  let isM2MApplication = true;

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/permissions/support.js");

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
      prefix: "/support/permissions",
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const payload = { fileId: "file-1", userId: "user-1" };

  it("adds a file sharing and echoes the body", async () => {
    addFileSharingMock.mockResolvedValue(undefined);

    const response = await app.inject({
      method: "POST",
      url: "/support/permissions",
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject(payload);
    expect(addFileSharingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining(payload),
    );
  });

  it("rejects non-M2M callers with 403", async () => {
    isM2MApplication = false;

    const response = await app.inject({
      method: "POST",
      url: "/support/permissions",
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(addFileSharingMock).not.toHaveBeenCalled();
  });
});
