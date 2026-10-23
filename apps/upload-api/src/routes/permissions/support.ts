import type { FastifyInstance } from "fastify";
import { HttpError } from "../../types/httpErrors.js";
import { Permissions } from "../../types/permissions.js";
import { getGenericResponseSchema } from "../../types/schemaDefinitions.js";
import {
  type AddPermissionsRequestBody,
  AddPermissionsRequestBodySchema,
} from "./schema.js";
import addFileSharing from "./utils/addFileSharing.js";
import { ensureShareTargetProfilesExist } from "./utils/ensureShareTargetProfilesExist.js";

const API_DOCS_TAG = "SupportPermissions";

export default async function routes(app: FastifyInstance) {
  app.post<{
    Body: AddPermissionsRequestBody;
  }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Platform.Write]),
      schema: {
        tags: [API_DOCS_TAG],
        body: AddPermissionsRequestBodySchema,
        response: {
          201: getGenericResponseSchema(AddPermissionsRequestBodySchema),
          "4xx": HttpError,
          "5xx": HttpError,
        },
      },
    },
    async (request, reply) => {
      if (!request.userData?.isM2MApplication) {
        throw app.httpErrors.forbidden(
          "You are not authorized to access this resource",
        );
      }

      const sharedWith =
        "userIds" in request.body
          ? request.body.userIds
          : [request.body.userId];
      await ensureShareTargetProfilesExist({
        organizationId: request.userData.organizationId,
        userIds: sharedWith,
        logger: request.log,
      });

      await addFileSharing(app.pg, request.body);

      reply.status(201);
      reply.send({ data: request.body });
    },
  );
}
