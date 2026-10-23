import { initializeErrorHandler } from "@ogcio/fastify-error-handler";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { registerMessagingAccessDeniedLog } from "./log-messaging-access-denied.js";

export default fp(
  async (server: FastifyInstance, _opts: FastifyPluginAsync) => {
    registerMessagingAccessDeniedLog(server);
    initializeErrorHandler(server);
  },
);
