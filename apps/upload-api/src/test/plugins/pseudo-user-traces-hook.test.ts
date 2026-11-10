import { FastifyOtelInstrumentation } from "@fastify/otel";
import { context, type Span, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import Fastify, { type FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pseudoUserTracesHook, {
  captureServerSpan,
} from "../../plugins/pseudo-user-traces-hook.js";

const ROOT_SPAN_NAME = "root-http-span";
const REQUEST_SPAN_NAME = "request";
const ID_ATTRIBUTE = "pseudo_user.id";
const VERSION_ATTRIBUTE = "pseudo_user.version";
const PSEUDO_USER = { id: "hash-1", version: "3" };

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

beforeAll(() => {
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  trace.setGlobalTracerProvider(provider);
});

afterAll(async () => {
  context.disable();
  trace.disable();
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
});

enum UserMode {
  WithPseudoUser,
  WithoutPseudoUser,
}

async function buildServer(mode: UserMode = UserMode.WithPseudoUser) {
  const server = Fastify({ logger: false });
  await server.register(
    new FastifyOtelInstrumentation({ requestHook: captureServerSpan }).plugin(),
  );
  await server.register(fp(async () => {}, { name: "api-auth-config" }));

  // Stands in for api-auth, which fills userData before preHandler.
  server.addHook("onRequest", async (request) => {
    request.userData = {
      userId: "user-1",
      accessToken: "token",
      isM2MApplication: false,
      scopes: [],
      ...(mode === UserMode.WithPseudoUser && { pseudoUser: PSEUDO_USER }),
    };
  });
  await server.register(pseudoUserTracesHook as unknown as FastifyPluginAsync);

  return server;
}

type TestServer = Awaited<ReturnType<typeof buildServer>>;

// Wraps the request in a root span, standing in for the HTTP server span.
// `onRoot` lets a test observe the span before the request runs.
async function injectUnderRoot(
  server: TestServer,
  url: string,
  onRoot?: (root: Span) => void,
) {
  const tracer = trace.getTracer("test");

  return tracer.startActiveSpan(ROOT_SPAN_NAME, async (root) => {
    try {
      onRoot?.(root);

      return await server.inject({ method: "GET", url });
    } finally {
      root.end();
    }
  });
}

function spansWith(attribute: string) {
  return exporter
    .getFinishedSpans()
    .filter((span) => attribute in span.attributes);
}

describe("pseudo-user-traces-hook", () => {
  it("sets pseudo user attributes on the root span on success", async () => {
    const server = await buildServer();
    server.get("/ok", async () => ({ ok: true }));

    const response = await injectUnderRoot(server, "/ok");

    expect(response.statusCode).toBe(200);
    const carriers = spansWith(ID_ATTRIBUTE);
    expect(carriers.map((span) => span.name)).toEqual([ROOT_SPAN_NAME]);
    expect(carriers[0].attributes[ID_ATTRIBUTE]).toBe(PSEUDO_USER.id);
    expect(carriers[0].attributes[VERSION_ATTRIBUTE]).toBe(PSEUDO_USER.version);

    await server.close();
  });

  it("sets pseudo user attributes on the root span on error", async () => {
    const server = await buildServer();
    server.get("/error", async () => {
      throw new Error("handler failed");
    });

    const response = await injectUnderRoot(server, "/error");

    expect(response.statusCode).toBe(500);
    const carriers = spansWith(ID_ATTRIBUTE);
    expect(carriers.map((span) => span.name)).toEqual([ROOT_SPAN_NAME]);
    expect(carriers[0].attributes[ID_ATTRIBUTE]).toBe(PSEUDO_USER.id);
    expect(carriers[0].attributes[VERSION_ATTRIBUTE]).toBe(PSEUDO_USER.version);

    await server.close();
  });

  it("sets each attribute once per request", async () => {
    const server = await buildServer();
    const writes: string[] = [];
    server.get("/once", async () => ({ ok: true }));

    await injectUnderRoot(server, "/once", (root) => {
      // Records every attribute write, to count them per key.
      const original = root.setAttribute.bind(root);
      root.setAttribute = (key, value) => {
        writes.push(key);
        return original(key, value);
      };
    });

    expect(writes.filter((key) => key === ID_ATTRIBUTE)).toHaveLength(1);
    expect(writes.filter((key) => key === VERSION_ATTRIBUTE)).toHaveLength(1);

    await server.close();
  });

  it("sets nothing when the request has no pseudo user", async () => {
    const server = await buildServer(UserMode.WithoutPseudoUser);
    server.get("/anonymous", async () => ({ ok: true }));

    const response = await injectUnderRoot(server, "/anonymous");

    expect(response.statusCode).toBe(200);
    expect(spansWith(ID_ATTRIBUTE)).toEqual([]);
    expect(spansWith(VERSION_ATTRIBUTE)).toEqual([]);

    await server.close();
  });

  it("falls back to the request span when there is no server span", async () => {
    const server = await buildServer();
    server.get("/no-span", async () => ({ ok: true }));

    // No upstream HTTP span: @fastify/otel's request span is the server span.
    const response = await server.inject({ method: "GET", url: "/no-span" });

    expect(response.statusCode).toBe(200);
    const carriers = spansWith(ID_ATTRIBUTE);
    expect(carriers.map((span) => span.name)).toEqual([REQUEST_SPAN_NAME]);
    expect(carriers[0].attributes[ID_ATTRIBUTE]).toBe(PSEUDO_USER.id);

    await server.close();
  });
});
