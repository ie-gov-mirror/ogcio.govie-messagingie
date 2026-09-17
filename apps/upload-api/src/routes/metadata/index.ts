import { httpErrors } from "@fastify/sensible";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { HttpError as OutputHttpError } from "../../types/httpErrors.js";
import { Permissions } from "../../types/permissions.js";
import {
  type FileMetadataType,
  getGenericResponseSchema,
  ResponseMetadata,
} from "../../types/schemaDefinitions.js";
import { ensureUserIdIsSet } from "../../utils/authentication-factory.js";
import getFileMetadataById from "../utils/getFileMetadataById.js";
import userCanAccessFileOrThrow from "../utils/userCanAccessFileOrThrow.js";
import {
  getOrganizationFiles,
  getSharedFiles,
  getUserFiles,
  scheduleFileForDeletion,
} from "./utils/filesMetadata.js";
import removeAllFileSharings from "./utils/removeAllFileSharings.js";

const API_DOCS_TAG = "Metadata";

export default async function routes(app: FastifyInstance) {
  app.get<{ Querystring: { userId?: string; organizationId?: string } }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [
          Permissions.Upload.Read,
          Permissions.UploadSelf.Read,
        ]),
      schema: {
        tags: [API_DOCS_TAG],
        querystring: Type.Optional(
          Type.Object({
            userId: Type.Optional(Type.String()),
            organizationId: Type.Optional(Type.String()),
          }),
        ),
        response: {
          200: getGenericResponseSchema(Type.Array(ResponseMetadata)),
          "4xx": OutputHttpError,
          "5xx": OutputHttpError,
        },
      },
    },
    async (request) => {
      const userId = ensureUserIdIsSet(request);
      const organizationId = request.userData?.organizationId;
      const isM2MApplication = request.userData?.isM2MApplication || false;
      ensureUserCanAccessResource({
        loggedInUserId: userId,
        queryUserId: request.query.userId,
        queryOrganizationId: request.query.organizationId,
        organizationId,
        isM2M: isM2MApplication,
      });

      const client = await app.pg.pool.connect();

      const queryUserId = request.query.userId;

      const queryOrganizationId = request.query.organizationId;

      /**
       * if public servant
       * if queries user return all owned files + all shared files withhin org
       * if queries org return all org files withing org
       *
       * if no public servant return shared files
       */

      try {
        if (organizationId) {
          if (queryUserId) {
            const userFiles = await getUserFiles({
              client,
              organizationId,
              userId: queryUserId,
              toExclude: [],
            });
            return { data: userFiles };
          }

          if (queryOrganizationId && queryOrganizationId === organizationId) {
            const filesResponse = await getOrganizationFiles({
              client,
              organizationId,
              toExclude: [],
            });
            return { data: filesResponse.rows };
          }

          throw app.httpErrors.forbidden(
            "You are not authorized to access other organization data",
          );
        }

        if (queryUserId === userId) {
          const sharedFiles = await getSharedFiles({
            client,
            userId: queryUserId,
            toExclude: [],
          });
          return { data: sharedFiles.rows };
        }

        throw app.httpErrors.forbidden(
          "You are not authorized to access other users data",
        );
      } catch (e) {
        throw app.httpErrors.createError(500, "Error getting files", {
          parent: e,
        });
      } finally {
        client.release();
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [
          Permissions.UploadSelf.Read,
          Permissions.Upload.Read,
        ]),
      schema: {
        tags: [API_DOCS_TAG],
        params: Type.Object({ id: Type.String() }),
        response: {
          200: getGenericResponseSchema(ResponseMetadata),
          "4xx": OutputHttpError,
          "5xx": OutputHttpError,
        },
      },
    },
    async (request, reply) => {
      const fileId = request.params.id;
      await userCanAccessFileOrThrow(app, request, fileId);
      let file: FileMetadataType | undefined;

      try {
        const fileData = await getFileMetadataById(app.pg, fileId);
        if (fileData.rows) {
          file = fileData.rows[0];
        }

        if (!file) {
          return app.httpErrors.notFound("File not found");
        }
      } catch (err) {
        throw app.httpErrors.createError(500, "Error retrieving files", {
          parent: err,
        });
      }

      const fileMetadata = {
        ...file,
        owner: file.ownerId,
      };

      return reply.send({ data: fileMetadata });
    },
  );

  app.delete<{ Body: { fileId: string } }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Upload.Write]),
      schema: {
        tags: [API_DOCS_TAG],
        body: Type.Object({ fileId: Type.String() }),
        response: {
          200: getGenericResponseSchema(Type.Object({ id: Type.String() })),
          "4xx": OutputHttpError,
          "5xx": OutputHttpError,
        },
      },
    },
    async (request, reply) => {
      const fileId = request.body.fileId;
      const userId = request.userData?.userId;
      const organizationId = request.userData?.organizationId;

      const auditDeletion = (allowed: boolean, message: string) => {
        request.log.info({ fileId, userId, organizationId, allowed }, message);
      };

      if (!fileId) {
        throw app.httpErrors.badRequest("File key not provided");
      }

      // Same policy as GET /metadata/:id: owning org, share, or linked profile.
      try {
        await userCanAccessFileOrThrow(app, request, fileId);
      } catch (err) {
        auditDeletion(false, "file deletion denied");
        throw err;
      }

      const fileData = await getFileMetadataById(app.pg, fileId);

      const file = fileData.rows?.[0];

      if (!file) {
        auditDeletion(false, "file deletion denied");
        throw app.httpErrors.notFound("File not found");
      }

      try {
        await scheduleFileForDeletion(app.pg, fileId);

        await removeAllFileSharings(app.pg, fileId);
      } catch (err) {
        throw app.httpErrors.createError(500, "Error deleting file", {
          parent: err,
        });
      }

      auditDeletion(true, "file deletion scheduled");

      reply.send({ data: { id: fileId } });
    },
  );
}

const ensureUserCanAccessResource = (params: {
  loggedInUserId: string;
  queryUserId?: string;
  queryOrganizationId?: string;
  organizationId?: string;
  isM2M?: boolean;
}) => {
  //public servant
  if (params.organizationId) {
    if (params.organizationId !== params.queryOrganizationId) {
      throw httpErrors.forbidden(
        "You are not allowed to access data for the requested organization",
      );
    }
    return;
  }

  if (params.loggedInUserId !== params.queryUserId) {
    throw httpErrors.forbidden(
      "You are not allowed to access data for the requested user",
    );
  }

  if (params.queryOrganizationId) {
    throw httpErrors.forbidden(
      "You are not allowed to access data for the requested organization",
    );
  }
};
