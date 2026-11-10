import type { BuildingBlocksSDK } from "@ogcio/building-blocks-sdk";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { getLifecycleWorkerM2MSdk } from "~/utils/authentication-factory.js";

declare module "fastify" {
  export interface FastifyInstance {
    getMessagingSupportSdk(): BuildingBlocksSDK["messaging"]["support"];
  }
}

export default fp(
  async (server: FastifyInstance, _opts: FastifyPluginAsync) => {
    server.decorate(
      "getMessagingSupportSdk",
      () =>
        getLifecycleWorkerM2MSdk(server.config, server.log).messaging.support,
    );
  },
);
