/**
 * Unit tests for the small decorator/hook plugins, called directly with a
 * fake fastify instance (same approach as pii-hasher.test.ts).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClamavClient } from "../../utils/clamav/index.js";

const getActiveSpanMock = vi.fn();
vi.mock("@ogcio/o11y-sdk-node", () => ({
  getActiveSpan: () => getActiveSpanMock(),
}));

type Hook = (request: FastifyRequest, reply?: unknown) => Promise<void>;
type Plugin = (fastify: FastifyInstance) => Promise<void> | void;

const buildFastify = (config: Record<string, unknown> = {}) => {
  const decorations: Record<string, unknown> = {};
  const hooks: Record<string, Hook[]> = {};
  const fastify = {
    config,
    decorate: (name: string, value: unknown) => {
      decorations[name] = value;
    },
    decorateRequest: vi.fn(),
    addHook: (name: string, hook: Hook) => {
      hooks[name] = hooks[name] ?? [];
      hooks[name].push(hook);
    },
    log: { warn: vi.fn(), debug: vi.fn() },
  } as unknown as FastifyInstance;
  return { fastify, decorations, hooks };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clamscan plugin", async () => {
  const plugin = (await import("../../plugins/clamscan.js"))
    .default as unknown as Plugin;

  it("decorates a configured ClamavClient", async () => {
    const { fastify, decorations } = buildFastify({
      CLAMAV_HOST: "clamav.local",
      CLAMAV_CHUNKS_NUMBER: 4,
      CLAMAV_CHUNK_SIZE_KB: 128,
    });

    await plugin(fastify);

    expect(decorations.avClient).toBeInstanceOf(ClamavClient);
  });
});

describe("cache plugin", async () => {
  const plugin = (await import("../../plugins/cache.js"))
    .default as unknown as Plugin;

  it("decorates a working node cache", async () => {
    const { fastify, decorations } = buildFastify();

    await plugin(fastify);

    const cache = decorations.nodeCache as {
      set: (k: string, v: string) => void;
      get: (k: string) => string | undefined;
    };
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });
});

describe("secrets-manager plugin", async () => {
  const plugin = (await import("../../plugins/secrets-manager.js"))
    .default as unknown as Plugin;

  it("returns undefined when configuration is incomplete", async () => {
    const { fastify, decorations } = buildFastify({});

    await plugin(fastify);

    const getSecretsManager = decorations.getSecretsManager as () => unknown;
    expect(getSecretsManager()).toBeUndefined();
  });

  it("creates a client when region and endpoint are set", async () => {
    const { fastify, decorations } = buildFastify({
      AWS_SECRETS_MANAGER_REGION: "eu-west-1",
      AWS_SECRETS_MANAGER_ENDPOINT: "http://localhost:4566",
    });

    await plugin(fastify);

    const getSecretsManager = decorations.getSecretsManager as () => unknown;
    expect(getSecretsManager()).toBeDefined();
  });

  it("passes explicit credentials through when set", async () => {
    const { fastify, decorations } = buildFastify({
      AWS_SECRETS_MANAGER_REGION: "eu-west-1",
      AWS_SECRETS_MANAGER_ENDPOINT: "http://localhost:4566",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
    });

    await plugin(fastify);

    const client = (decorations.getSecretsManager as () => unknown)() as {
      config: { credentials: () => Promise<{ accessKeyId: string }> };
    };
    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: "key",
    });
  });
});

describe("pseudo-user-traces-hook plugin", async () => {
  const { default: plugin, captureServerSpan } = await import(
    "../../plugins/pseudo-user-traces-hook.js"
  );

  const runHook = async (request: unknown) => {
    const { fastify, hooks } = buildFastify();
    await (plugin as unknown as Plugin)(fastify);
    await hooks.preHandler?.[0](request as FastifyRequest);
  };

  it("captureServerSpan stores the active span on the request", () => {
    const span = { setAttribute: vi.fn() };
    getActiveSpanMock.mockReturnValue(span);
    const request = {} as FastifyRequest;

    captureServerSpan(undefined as never, request);

    expect(request.serverSpan).toBe(span);
  });

  it("sets span attributes for pseudo users", async () => {
    const setAttribute = vi.fn();

    await runHook({
      serverSpan: { setAttribute },
      userData: { pseudoUser: { id: "pseudo-1", version: 2 } },
    });

    expect(setAttribute).toHaveBeenCalledWith("pseudo_user.id", "pseudo-1");
    expect(setAttribute).toHaveBeenCalledWith("pseudo_user.version", 2);
  });

  it("does nothing without a pseudo user", async () => {
    const setAttribute = vi.fn();

    await runHook({ serverSpan: { setAttribute }, userData: {} });

    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("does nothing without a server span", async () => {
    await expect(
      runHook({ userData: { pseudoUser: { id: "p", version: 1 } } }),
    ).resolves.toBeUndefined();
  });
});
