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
const OPENAPI_CONTRACT_VERSION = "1.3.0";

export default fp(
  async (fastify: FastifyInstance, _opts: FastifyPluginAsync) => {
    // Have to register the two plugins in the same file
    // because swaggerUi is dependent on Swagger
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: "OGCIO MessagingIE API",
          description: "API for OGCIO MessagingIE Service",
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
    });

    // sanitize input
    // https://docs.bearer.com/reference/rules/javascript_lang_path_traversal/
    const logoPath = join(
      fastify.dirname.replace(/^(\.\.(\/|\\|$))+/, ""),
      "public",
      "logo.png",
    );

    fastify.register(fastifySwaggerUi, {
      routePrefix: "/docs",
      transformSpecificationClone: true,
      transformSpecification(swaggerObject) {
        // thanks to this we can avoid to remove endpoints
        // from the open api definition so to be able to use them
        // in the SDKs but at the same time hide them
        // in the Swagger UI
        delete swaggerObject.paths["/api/v1/user-imports/template-download"];
        return swaggerObject;
      },
      logo: {
        type: "image/png",
        content: Buffer.from(
          fs.readFileSync(logoPath).toString("base64"),
          "base64",
        ),
      },
    });
  },
  { name: "fastifySwagger" },
);
