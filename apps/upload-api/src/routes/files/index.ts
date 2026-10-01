import { PassThrough, pipeline, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { HttpError as OutputHttpError } from "../../types/httpErrors.js";
import { Permissions } from "../../types/permissions.js";
import { getGenericResponseSchema } from "../../types/schemaDefinitions.js";

import getFileMetadataById from "../utils/getFileMetadataById.js";
import userCanAccessFileOrThrow from "../utils/userCanAccessFileOrThrow.js";
import PromiseTransform from "./PromiseTransform.js";
import buildContentDisposition from "./utils/contentDisposition.js";
import { deleteObject } from "./utils/deleteObject.js";
import { getResponseMimeType } from "./utils/fileTypes.js";
import getDbVersion from "./utils/getDbVersion.js";
import { getUploadLimit } from "./utils/getUploadLimit.js";
import { processUpload } from "./utils/scanAndUpload.js";
import updateFileMetadata from "./utils/updateFileMetadata.js";

const API_DOCS_TAG = "Files";

function asNodeReadableStream(stream: Readable | ReadableStream) {
  if (stream instanceof Readable) {
    return stream;
  }

  return Readable.fromWeb(stream as unknown as NodeReadableStream);
}

export default async function routes(app: FastifyInstance) {
  const uploadLimitPerIpPerMinute = getUploadLimit(app.config);
  const antivirusScanEnabled = app.config.ANTIVIRUS_SCAN_ENABLED as boolean;

  app.post(
    "/",
    {
      config: {
        rateLimit: { max: uploadLimitPerIpPerMinute, timeWindow: "1 minute" },
      },
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Upload.Write]),
      schema: {
        consumes: ["multipart/form-data"],
        body: Type.Union([Type.Any(), Type.Unknown()]),
        tags: [API_DOCS_TAG],
        response: {
          201: getGenericResponseSchema(Type.Object({ id: Type.String() })),
          "4xx": OutputHttpError,
          "5xx": OutputHttpError,
        },
      },
    },
    async (request, reply) => {
      request.log.info("starting scan and upload file");
      const fileId = await processUpload(app, request, {
        scan: antivirusScanEnabled,
      });
      request.log.info("finished scan and upload file");

      reply.status(201);
      reply.send({ data: { id: fileId } });
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
          200: Type.String(),
          "4xx": OutputHttpError,
          "5xx": OutputHttpError,
        },
      },
    },
    async (request, reply) => {
      let response: GetObjectCommandOutput | undefined;

      const fileId = request.params.id;
      request.log.info(
        { fileId, userId: request.userData?.userId },
        "begin: get file",
      );

      request.log.info(
        { userId: request.userData?.userId },
        "begin: check if user can access file",
      );
      await userCanAccessFileOrThrow(app, request, fileId);
      request.log.info(
        { userId: request.userData?.userId },
        "end: check if user can access file",
      );

      request.log.info(
        { fileId, userId: request.userData?.userId },
        "begin: get file metadata",
      );
      const fileData = await getFileMetadataById(app.pg, fileId);
      request.log.info(
        { fileId, userId: request.userData?.userId },
        "end: get file metadata",
      );

      const file = fileData.rows.length > 0 ? fileData.rows[0] : undefined;

      if (!file) {
        request.log.error("file not found");
        throw app.httpErrors.notFound("File not found");
      }

      if (file.infected) {
        request.log.error(
          {
            fileName: file.fileName,
            infectionDescription: file.infectionDescription,
          },
          "file is infected",
        );
        throw app.httpErrors.badRequest("File is infected");
      }

      try {
        request.log.info({ fileId, key: file.key }, "begin: get file from s3");
        response = await app.s3Client.client.send(
          new GetObjectCommand({
            Bucket: app.s3Client.bucketName,
            Key: `${file.key}`,
          }),
        );

        request.log.info({ fileId, key: file.key }, "end: get file from s3");
      } catch (err) {
        request.log.error(
          { fileId, key: file.key, err },
          "error getting file from s3",
        );
        const err_ = err as { $metadata: { httpStatusCode: number } };
        if (err_.$metadata.httpStatusCode === 404) {
          await updateFileMetadata(app.pg, {
            ...file,
            deleted: true,
          });
          throw app.httpErrors.notFound("File not found");
        }
        throw app.httpErrors.createError(500, "Error getting file", {
          parent: err,
        });
      }

      const body = response.Body;
      if (!body) {
        request.log.error({ fileId, key: file.key }, "body not found");
        throw app.httpErrors.internalServerError("Body not found");
      }
      const sourceStream = asNodeReadableStream(body.transformToWebStream());
      const downloadPassthrough = new PassThrough();

      const skipAv = response.Metadata?.skip_av === "true";
      const antivirusDbVersion = skipAv
        ? file.antivirusDbVersion
        : await getDbVersion(app.avClient, app.nodeCache);

      let downloadAborted = false;

      const destroyDownload = () => {
        downloadAborted = true;
        sourceStream.destroy();
        downloadPassthrough.destroy();
        reply.raw.destroy();
      };

      if (!skipAv && file.antivirusDbVersion !== antivirusDbVersion) {
        const antivirusPassthrough = app.avClient.passthrough();

        const scanCompleted = new Promise<void>((resolve) => {
          antivirusPassthrough.once("error", (err) => {
            request.log.error(
              { err, fileId, key: file.key },
              "error on scanning for virus",
            );

            // Rejecting here can cause html 5 video to throw ERR_STREAM_PREMATURE_CLOSE

            // return reject(
            //   new CustomError(
            //     FILE_DOWNLOAD,
            //     "Internal server error",
            //     500,
            //     "ANTIVIRUS_SCAN_ERROR",
            //     err,
            //   ),
            // );
          });

          antivirusPassthrough.once("scan-complete", async (result) => {
            request.log.info("end: anti virus scan");
            const { isInfected, viruses } = result;
            const infectionDescription = viruses.join(",");

            let fileDeleted = false;

            if (isInfected) {
              request.log.info(
                {
                  fileId,
                  key: file.key,
                  infectionDescription,
                },
                "file is infected",
              );
              const s3Config = app.s3Client;
              try {
                request.log.info(
                  {
                    fileId,
                    key: file.key,
                  },
                  "begin: deleting file",
                );
                await deleteObject(
                  s3Config.client,
                  s3Config.bucketName,
                  file.key,
                );
                request.log.info(
                  {
                    fileId,
                    key: file.key,
                  },
                  "end: deleting file",
                );
                fileDeleted = true;
              } catch (error) {
                request.log.error(error);
              }
            }

            try {
              request.log.info(
                {
                  fileId,
                  key: file.key,
                },
                "begin: update file metadata",
              );
              const metadata = {
                ...file,
                lastScan: new Date(),
                infected: isInfected,
                deleted: fileDeleted,
                infectionDescription,
                antivirusDbVersion,
              };

              if (!isInfected) {
                resolve();
                void updateFileMetadata(app.pg, metadata)
                  .then(() => {
                    request.log.info(
                      {
                        fileId,
                        key: file.key,
                      },
                      "end: update file metadata",
                    );
                  })
                  .catch((error) => {
                    request.log.error(error);
                  });
                return;
              }

              await updateFileMetadata(app.pg, metadata);
              request.log.info(
                {
                  fileId,
                  key: file.key,
                },
                "end: update file metadata",
              );
            } catch (error) {
              request.log.error(error);
            }
            if (isInfected) {
              destroyDownload();
              return;
            }
          });
        });

        request.log.info("begin: anti virus scan");
        pipeline(
          sourceStream,
          antivirusPassthrough,
          new PromiseTransform(scanCompleted),
          downloadPassthrough,
          (err) => {
            if (!err || downloadAborted) {
              return;
            }

            request.log.error(
              { err, fileId, key: file.key },
              "error piping file download",
            );
            downloadPassthrough.destroy(err);
          },
        );
      } else {
        pipeline(sourceStream, downloadPassthrough, (err) => {
          if (!err || downloadAborted) {
            return;
          }

          request.log.error(
            { err, fileId, key: file.key },
            "error piping file download",
          );
          downloadPassthrough.destroy(err);
        });
      }

      request.log.info({ fileId }, "end: get file");
      reply.header(
        "Content-Disposition",
        buildContentDisposition(file.fileName),
      );
      reply.header("Content-Type", getResponseMimeType(file.fileName));
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Content-Length", file.fileSize);
      return reply.send(downloadPassthrough);
    },
  );
}
