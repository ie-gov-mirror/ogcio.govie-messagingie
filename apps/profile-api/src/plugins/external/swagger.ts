import fs from "node:fs";
import { join } from "node:path";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

// The OpenAPI contract version, bumped deliberately when this API's contract
// changes. It is NOT the package.json version: release-please bumps that on
// every release (a dependency bump included), which silently desynced the
// committed openapi-definition.yml twice (AB#41456, AB#44058). release-please
// cannot maintain the committed spec either — its YAML updater reserialises
// with js-yaml and drops formatting, while @fastify/swagger emits with `yaml`.
// upload-api and scheduler-api already carry a literal here; all four match.
const OPENAPI_CONTRACT_VERSION = "0.1.4";

export default fp(
  async (fastify: FastifyInstance, opts: FastifyPluginAsync) => {
    // Have to register the two plugins in the same file
    // because swaggerUi is dependent on Swagger
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: "Life Events Profile API",
          description: "API for Life Events Profile Service",
          version: OPENAPI_CONTRACT_VERSION,
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
      ...opts,
    });
    fastify.register(fastifySwaggerUi, {
      routePrefix: "/docs",
      logo: {
        type: "image/png",
        content: Buffer.from(
          fs
            .readFileSync(join(fastify.dirname, "public", "logo.png"))
            .toString("base64"),
          "base64",
        ),
      },
      ...opts,
    });
  },
  { name: "fastifySwagger" },
);
