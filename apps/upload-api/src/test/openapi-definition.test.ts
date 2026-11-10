import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

// `build()` awaits both of these against a live postgres before it returns.
// Neither contributes a route or a schema, so stubbing them leaves the emitted
// spec identical to the one a real boot writes. They are imported statically by
// `app.ts`, so Vitest's module mocks reach them.
vi.mock("../utils/storeConfig.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/storeConfig.js")>()),
  seedConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../utils/scheduleCleanupTask.js", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

describe("openapi-definition.yml", () => {
  let app: FastifyInstance | undefined;
  let s3Stub: Server;

  beforeAll(async () => {
    // The s3 plugin is autoloaded, and @fastify/autoload imports plugin files
    // by absolute path, which is outside the module graph Vitest can mock. So
    // satisfy its startup HeadBucket for real against a local stub instead of
    // mocking it — that also keeps every plugin and route genuinely registered.
    s3Stub = createServer((_req, res) => res.writeHead(200).end());
    await new Promise<void>((resolve) =>
      s3Stub.listen(0, "127.0.0.1", resolve),
    );
    const { port } = s3Stub.address() as AddressInfo;
    process.env.S3_ENDPOINT = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => s3Stub.close(() => resolve()));
  });

  it("matches the spec the API emits", async () => {
    const { build } = await import("../app.js");
    app = await build();
    await app.ready();
    const committed = await readFile(
      join(import.meta.dirname, "../../openapi-definition.yml"),
      "utf8",
    );
    // Document equality. yaml reflows long plain scalars when line-width
    // accounting changes, which a dependency bump on main already did to the
    // committed files. The contract is the document.
    expect(parse(app.swagger({ yaml: true }))).toEqual(parse(committed));
  });
});
