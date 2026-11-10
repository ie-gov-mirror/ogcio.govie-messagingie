import { randomUUID } from "node:crypto";
import { PassThrough, pipeline, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import type fastifyPostgres from "@fastify/postgres";
import { httpErrors } from "@fastify/sensible";
import type { FastifyBaseLogger } from "fastify";
import type { FileMetadataType } from "../../../types/schemaDefinitions.js";
import type { ClamavClient } from "../../../utils/clamav/index.js";
import getFilesMetadataById from "../../utils/getFilesMetadataById.js";
import PromiseTransform from "../PromiseTransform.js";
import getDbVersion, { type NodeCacheLike } from "./getDbVersion.js";
import updateFileMetadata from "./updateFileMetadata.js";

const MAX_FILE_IDS = 20;

type FileMetadataWithId = FileMetadataType & { id: string };

function isMissingS3ObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const awsError = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    awsError.name === "NoSuchKey" ||
    awsError.Code === "NoSuchKey" ||
    awsError.$metadata?.httpStatusCode === 404
  );
}

type DownloadMultipleFilesParams = {
  fileIds: string[];
  s3Client: S3Client;
  bucketName: string;
  avClient: ClamavClient;
  nodeCache?: NodeCacheLike;
  pg: fastifyPostgres.PostgresDb;
  logger: FastifyBaseLogger;
};

const deleteObject = (s3Client: S3Client, bucketName: string, key: string) => {
  return s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
};

export default async function downloadMultipleFiles(
  params: DownloadMultipleFilesParams,
): Promise<{ stream: PassThrough; boundary: string }> {
  const { fileIds, s3Client, bucketName, avClient, nodeCache, pg, logger } =
    params;

  if (fileIds.length === 0) {
    throw httpErrors.badRequest("No file IDs provided");
  }

  if (fileIds.length > MAX_FILE_IDS) {
    throw new Error(`Cannot download more than ${MAX_FILE_IDS} files at once`);
  }

  const filesResult = await getFilesMetadataById(pg, fileIds);
  const filesMap = new Map<string, FileMetadataWithId>();
  for (const row of filesResult.rows) {
    if (!row.id) {
      throw new Error("File metadata row is missing an id");
    }

    filesMap.set(row.id, { ...row, id: row.id });
  }

  const files = fileIds.map((fileId) => {
    const file = filesMap.get(fileId);
    if (!file) {
      throw httpErrors.notFound(`File not found: ${fileId}`);
    }
    if (file.infected) {
      throw httpErrors.forbidden(`File is infected: ${fileId}`);
    }

    return file;
  });

  const antivirusDbVersion = await getDbVersion(avClient, nodeCache);

  const boundary = randomUUID();
  const output = new PassThrough();

  const processFiles = async () => {
    try {
      for (const file of files) {
        const fileId = file.id;
        let response: GetObjectCommandOutput;

        try {
          response = await s3Client.send(
            new GetObjectCommand({
              Bucket: bucketName,
              Key: file.key,
            }),
          );
        } catch (error) {
          if (isMissingS3ObjectError(error)) {
            logger.warn(
              { fileId, key: file.key },
              "file not found in bucket, skipping it from response",
            );
            continue;
          }

          throw error;
        }

        const body = response.Body;

        if (!body) {
          logger.warn(
            { fileId, key: file.key },
            "file body is empty, skipping it from response",
          );
          continue;
        }

        const partHeaders = [
          `--${boundary}`,
          `Content-Type: ${file.mimeType}`,
          `Content-Disposition: attachment; filename="${file.fileName}"`,
          "",
          "",
        ].join("\r\n");

        await writeToOutput(output, partHeaders);

        const s3Stream = Readable.fromWeb(
          body.transformToWebStream() as NodeReadableStream,
        );

        if (file.antivirusDbVersion !== antivirusDbVersion) {
          await pipeWithAvScan({
            s3Stream,
            output,
            file,
            avClient,
            antivirusDbVersion,
            s3Client,
            bucketName,
            pg,
            logger,
          });
        } else {
          await pipeStreamToOutput(s3Stream, output);
        }

        await writeToOutput(output, "\r\n");
      }

      output.write(`--${boundary}--\r\n`);
      output.end();
    } catch (err) {
      output.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  };

  // Start processing asynchronously — the caller reads from `output` immediately
  processFiles();

  return { stream: output, boundary };
}

function writeToOutput(output: PassThrough, data: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (output.write(data)) {
      resolve();
    } else {
      output.once("drain", resolve);
    }
  });
}

function pipeStreamToOutput(
  source: Readable,
  output: PassThrough,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const passthrough = new PassThrough();
    passthrough.pipe(output, { end: false });

    passthrough.on("end", () => {
      passthrough.unpipe(output);
      resolve();
    });

    pipeline(source, passthrough, (err) => {
      if (err) {
        passthrough.unpipe(output);
        reject(err);
      }
    });
  });
}

async function pipeWithAvScan(params: {
  s3Stream: Readable;
  output: PassThrough;
  file: FileMetadataType;
  avClient: ClamavClient;
  antivirusDbVersion: string;
  s3Client: S3Client;
  bucketName: string;
  pg: fastifyPostgres.PostgresDb;
  logger: FastifyBaseLogger;
}): Promise<void> {
  const {
    s3Stream,
    output,
    file,
    avClient,
    antivirusDbVersion,
    s3Client,
    bucketName,
    pg,
    logger,
  } = params;

  return new Promise<void>((resolve, reject) => {
    const antivirusPassthrough = avClient.passthrough();

    const scanPromise = new Promise<void>((scanResolve) => {
      antivirusPassthrough.once("error", (err) => {
        logger.error(
          { err, fileId: file.id, key: file.key },
          "error on scanning for virus",
        );
      });

      antivirusPassthrough.once(
        "scan-complete",
        async (result: {
          isInfected: boolean;
          failed?: boolean;
          viruses: string[];
        }) => {
          const { isInfected, failed, viruses } = result;

          // Same as a scan error: serve, but do not record the file as scanned.
          if (failed) {
            logger.error(
              { fileId: file.id, key: file.key },
              "antivirus scan failed",
            );
            scanResolve();
            return;
          }

          let fileDeleted = false;

          if (isInfected) {
            logger.info(
              {
                fileId: file.id,
                key: file.key,
                infectionDescription: viruses.join(","),
              },
              "file is infected",
            );

            try {
              await deleteObject(s3Client, bucketName, file.key);
              fileDeleted = true;
            } catch (error) {
              logger.error(error);
            }
          }

          try {
            await updateFileMetadata(pg, {
              ...file,
              lastScan: new Date(),
              infected: isInfected,
              deleted: fileDeleted,
              infectionDescription: viruses.join(","),
              antivirusDbVersion,
            });
          } catch (error) {
            logger.error(error);
          }

          if (isInfected) {
            reject(new Error(`File is infected: ${file.id}`));
            return;
          }

          scanResolve();
        },
      );
    });

    const promiseTransform = new PromiseTransform(scanPromise);
    const collector = new PassThrough();
    collector.pipe(output, { end: false });

    collector.on("end", () => {
      collector.unpipe(output);
      resolve();
    });

    pipeline(
      s3Stream,
      antivirusPassthrough,
      promiseTransform,
      collector,
      (err) => {
        if (err) {
          collector.unpipe(output);
          reject(err);
        }
      },
    );
  });
}
