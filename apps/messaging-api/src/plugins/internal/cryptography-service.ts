import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import CryptographyService from "../../utils/cryptography-service.js";

declare module "fastify" {
  export interface FastifyInstance {
    cryptographyService: CryptographyService;
  }
}

export default fp(
  async (server: FastifyInstance, _opts: FastifyPluginAsync) => {
    // Email provider passwords are encrypted at rest, whatever the feature-flag setup
    server.decorate(
      "cryptographyService",
      new CryptographyService(server.config),
    );
  },
);
