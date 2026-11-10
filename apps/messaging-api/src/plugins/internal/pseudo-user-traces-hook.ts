import { getActiveSpan } from "@ogcio/o11y-sdk-node";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";

type ServerSpan = NonNullable<ReturnType<typeof getActiveSpan>>;

declare module "fastify" {
  export interface FastifyRequest {
    serverSpan?: ServerSpan;
  }
}

// Runs inside @fastify/otel's request hook, where the active span is the
// HTTP server span. Later hooks see short-lived hook spans as active.
// Without an HTTP span, @fastify/otel's own request span is the server span.
export function captureServerSpan(
  requestSpan: ServerSpan,
  request: FastifyRequest,
): void {
  request.serverSpan = getActiveSpan() ?? requestSpan;
}

export default fp(
  async (server: FastifyInstance, _opts: FastifyPluginAsync) => {
    server.decorateRequest("serverSpan", undefined);

    server.addHook("preHandler", async (request) => {
      if (!request.userData?.pseudoUser) {
        return;
      }

      const serverSpan = request.serverSpan;
      if (!serverSpan) {
        return;
      }

      serverSpan.setAttribute("pseudo_user.id", request.userData.pseudoUser.id);
      serverSpan.setAttribute(
        "pseudo_user.version",
        request.userData.pseudoUser.version,
      );
    });
  },
  { name: "pseudo-user-traces-hook", dependencies: ["api-auth"] },
);
