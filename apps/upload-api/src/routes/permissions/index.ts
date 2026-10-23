import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { HttpError } from "../../types/httpErrors.js";
import { Permissions } from "../../types/permissions.js";
import { getGenericResponseSchema } from "../../types/schemaDefinitions.js";
import userCanAccessFileOrThrow from "../utils/userCanAccessFileOrThrow.js";
import {
  type AddPermissionsRequestBody,
  AddPermissionsRequestBodySchema,
} from "./schema.js";
import addFileSharing from "./utils/addFileSharing.js";
import { ensureShareTargetProfilesExist } from "./utils/ensureShareTargetProfilesExist.js";
import getFileSharings from "./utils/getFileSharings.js";
import removeFileSharing from "./utils/removeFileSharing.js";

const API_DOCS_TAG = "Permissions";

export default async function routes(app: FastifyInstance) {
  app.post<{
    Body: AddPermissionsRequestBody;
  }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Upload.Write]),
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
      const { fileId } = request.body;
      const sharedWith =
        "userIds" in request.body
          ? request.body.userIds
          : [request.body.userId];

      // Only someone who can already access the file (owner / owning org /
      // linked profile) may create a share for it. Mirrors the check the
      // DELETE and GET handlers below already perform, closing the write-side
      // gap where any `upload:file:write` caller could share an arbitrary file.
      await userCanAccessFileOrThrow(app, request, fileId);
      await ensureShareTargetProfilesExist({
        organizationId: request.userData?.organizationId,
        userIds: sharedWith,
        logger: request.log,
      });

      await addFileSharing(app.pg, request.body);

      request.log.info(
        {
          fileId,
          sharedWith,
          sharedBy: request.userData?.userId,
          organizationId: request.userData?.organizationId,
        },
        "file sharing created",
      );

      reply.status(201);
      reply.send({ data: request.body });
    },
  );

  app.delete<{ Body: { fileId: string; userId: string } }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Upload.Write]),
      schema: {
        tags: [API_DOCS_TAG],
        body: Type.Object({
          fileId: Type.String(),
          userId: Type.String(),
        }),
        response: {
          "4xx": HttpError,
          "5xx": HttpError,
        },
      },
    },
    async (request, reply) => {
      const { fileId, userId } = request.body;
      await userCanAccessFileOrThrow(app, request, fileId);
      try {
        await removeFileSharing(app.pg, fileId, userId);
      } catch (err) {
        throw app.httpErrors.createError(
          500,
          "Internal server error removing permissions",
          { parent: err },
        );
      }
      reply.send();
    },
  );

  app.get<{ Querystring: { fileId: string } }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Upload.Write]),
      schema: {
        tags: [API_DOCS_TAG],
        querystring: Type.Object({
          fileId: Type.String(),
        }),
        response: {
          "200": getGenericResponseSchema(
            Type.Array(
              Type.Object({ fileId: Type.String(), userId: Type.String() }),
            ),
          ),
          "4xx": HttpError,
          "5xx": HttpError,
        },
      },
    },
    async (request) => {
      const { fileId } = request.query;
      await userCanAccessFileOrThrow(app, request, fileId);
      try {
        const sharingsQueryResponse = await getFileSharings(app.pg, fileId);
        return { data: sharingsQueryResponse.rows };
      } catch (err) {
        throw app.httpErrors.createError(
          500,
          "Internal server error retrieving permissions",
          { parent: err },
        );
      }
    },
  );
}
