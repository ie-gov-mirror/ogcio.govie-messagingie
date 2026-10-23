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

const selectProfilesMock = vi.fn();
vi.mock("../../../utils/authentication-factory.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../utils/authentication-factory.js")
  >("../../../utils/authentication-factory.js");
  return {
    ...actual,
    getM2MProfileSdk: () =>
      Promise.resolve({
        selectProfiles: (...args: unknown[]) => selectProfilesMock(...args),
      }),
  };
});

describe("permissions support routes", async () => {
  let app: FastifyInstance;
  let isM2MApplication = true;

  const { build } = await import("../../../app.js");
  const routes = await import("../../../routes/permissions/support.js");

  beforeEach(async () => {
    vi.clearAllMocks();
    selectProfilesMock.mockImplementation(async (ids: string) => ({
      data: ids
        .split(",")
        .filter((id) => id.length > 0)
        .map((id) => ({ id })),
    }));
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
    expect(selectProfilesMock).toHaveBeenCalledWith(
      payload.userId,
      undefined,
      false,
    );
  });

  it("adds a file sharing for several existing profiles", async () => {
    const userIds = ["user-1", "user-2"];
    const response = await app.inject({
      method: "POST",
      url: "/support/permissions",
      payload: { fileId: "file-1", userIds },
    });

    expect(response.statusCode).toBe(201);
    expect(addFileSharingMock).toHaveBeenCalled();
    expect(selectProfilesMock).toHaveBeenCalledWith(
      "user-1,user-2",
      undefined,
      false,
    );
  });

  it("returns 404 and does not write when a target profile is missing", async () => {
    selectProfilesMock.mockResolvedValue({ data: [{ id: "user-1" }] });

    const response = await app.inject({
      method: "POST",
      url: "/support/permissions",
      payload: { fileId: "file-1", userIds: ["user-1", "missing"] },
    });

    expect(response.statusCode).toBe(404);
    expect(addFileSharingMock).not.toHaveBeenCalled();
  });

  it("returns 503 and does not write when Profile fails", async () => {
    selectProfilesMock.mockResolvedValue({ error: { statusCode: 500 } });

    const response = await app.inject({
      method: "POST",
      url: "/support/permissions",
      payload,
    });

    expect(response.statusCode).toBe(503);
    expect(addFileSharingMock).not.toHaveBeenCalled();
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
