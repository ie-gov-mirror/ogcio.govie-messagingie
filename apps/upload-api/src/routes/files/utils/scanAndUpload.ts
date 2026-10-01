import { randomUUID } from "node:crypto";
import { PassThrough, pipeline } from "node:stream";
import { Upload } from "@aws-sdk/lib-storage";
import type { HttpError } from "@fastify/sensible";
import { getErrorMessage } from "@ogcio/shared-errors";
import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { deleteObject } from "./deleteObject.js";
import { ALLOWED_EXTENSIONS } from "./fileTypes.js";
import getDbVersion from "./getDbVersion.js";
import getFilename from "./getFilename.js";
import insertFileMetadata from "./insertFileMetadata.js";

type ProcessUploadOptions = {
  scan: boolean;
  customMaxFileSize?: number;
};

type UploadRequestData = NonNullable<
  Awaited<ReturnType<FastifyRequest["file"]>>
>;

type UploadResult = Awaited<ReturnType<Upload["done"]>>;

type ScanResult = {
  isInfected: boolean;
  viruses: string[];
};

type PreparedUpload = {
  expirationDate?: Date;
  externalId?: string;
  data: UploadRequestData;
  fileKey: string;
  fileMimeType: string;
  fileUuid: string;
  filename: string;
  getFileLength: () => number;
  organizationId: string;
  s3Upload: Upload;
  s3uploadPassthrough: PassThrough;
  stream: UploadRequestData["file"];
  userId: string;
};

type UploadExecutionResult = {
  dbVersion?: string;
  scanResult?: ScanResult;
  uploadResult: UploadResult;
};

const getS3ConfiguredChunkSize = (
  app: FastifyInstance,
): { chunkSize: number; chunksNumber: number } => {
  const chunkSizeMB = app.config.S3_CHUNK_SIZE_MB as number;
  const chunksNumber = app.config.S3_CHUNKS_NUMBER as number;
  return { chunkSize: chunkSizeMB * 1024 * 1024, chunksNumber };
};

const containsControlCharacters = (filename: string) =>
  Array.from(filename).some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f;
  });

const isFilenameAllowed = (filename: string) => {
  // control characters could otherwise reach response headers on download
  if (containsControlCharacters(filename)) {
    return false;
  }

  // it is a dotfile or does not have extension
  if (filename.startsWith(".") || !filename.match(/\.\S+$/)) {
    return false;
  }

  return ALLOWED_EXTENSIONS.some((extension) =>
    filename.toLowerCase().endsWith(extension),
  );
};

function getRequestFileParams(options: ProcessUploadOptions): {
  throwFileSizeLimit: boolean;
  limits?: { fileSize: number; files: number };
} {
  if (!options.customMaxFileSize) {
    return { throwFileSizeLimit: true };
  }

  return {
    throwFileSizeLimit: true,
    limits: {
      fileSize: options.customMaxFileSize,
      files: 1,
    },
  };
}

async function getUploadRequestData(
  app: FastifyInstance,
  request: FastifyRequest,
  options: ProcessUploadOptions,
): Promise<UploadRequestData> {
  const data = await request.file(getRequestFileParams(options));

  if (!data) {
    request.log.error("request is not multipart");
    throw app.httpErrors.badRequest("Request is not multipart");
  }

  if (data.file.truncated) {
    request.log.error("file too large");
    throw app.httpErrors.payloadTooLarge("File is too large");
  }

  return data;
}

function getUploadFields(data: UploadRequestData): {
  expirationDate?: Date;
  externalId?: string;
} {
  const { externalId } = data.fields as { externalId?: string };

  let expirationDate: Date | undefined;
  if (data.fields.expirationDate) {
    expirationDate = new Date(
      (data.fields.expirationDate as { value: string }).value,
    );
  }

  return { expirationDate, externalId };
}

function validateFilenameOrThrow(
  app: FastifyInstance,
  request: FastifyRequest,
  filename?: string,
): string {
  if (!filename) {
    request.log.error("Filename is not provided");
    throw app.httpErrors.badRequest("Filename is not provided");
  }

  if (!isFilenameAllowed(filename)) {
    request.log.error({ filename }, "File not allowed");
    throw app.httpErrors.badRequest("File not allowed");
  }

  return filename;
}

async function resolveFilename(
  app: FastifyInstance,
  request: FastifyRequest,
  inputFilename: string,
  userId: string,
) {
  request.log.info("begin: getting filename");
  const filename = await getFilename(app.pg, inputFilename, userId);
  request.log.info("end: getting filename");
  return filename;
}

function trackFileLength(
  stream: UploadRequestData["file"],
  request: FastifyRequest,
) {
  let length = 0;

  stream.on("data", (chunk: string | null | undefined) => {
    length += chunk?.length ?? 0;
  });

  stream.on("end", () => {
    request.log.info("end: file stream");
  });

  return () => length;
}

function createS3Upload(
  app: FastifyInstance,
  fileKey: string,
  scan: boolean,
): {
  s3Upload: Upload;
  s3uploadPassthrough: PassThrough;
} {
  const getS3ChunkConfig = getS3ConfiguredChunkSize(app);
  const s3uploadPassthrough = new PassThrough();

  const s3Upload = new Upload({
    client: app.s3Client.client,
    queueSize: getS3ChunkConfig.chunksNumber,
    partSize: getS3ChunkConfig.chunkSize,
    leavePartsOnError: false,
    params: {
      Bucket: app.s3Client.bucketName,
      Key: fileKey,
      Body: s3uploadPassthrough,
      Metadata: {
        skip_av: scan ? "false" : "true",
      },
    },
  });

  return { s3Upload, s3uploadPassthrough };
}

async function prepareUpload(
  app: FastifyInstance,
  request: FastifyRequest,
  options: ProcessUploadOptions,
): Promise<PreparedUpload> {
  const data = await getUploadRequestData(app, request, options);
  const { expirationDate, externalId } = getUploadFields(data);
  const userId = request.userData?.userId as string;
  const organizationId = request.userData?.organizationId as string;
  const stream = data.file;
  const fileMimeType = data.mimetype;
  const inputFilename = validateFilenameOrThrow(app, request, data.filename);
  const filename = await resolveFilename(app, request, inputFilename, userId);
  const getFileLength = trackFileLength(stream, request);
  const fileUuid = randomUUID();
  const fileKey = `${userId}/${fileUuid}`;
  const { s3Upload, s3uploadPassthrough } = createS3Upload(
    app,
    fileKey,
    options.scan,
  );

  return {
    expirationDate,
    externalId,
    data,
    fileKey,
    fileMimeType,
    fileUuid,
    filename,
    getFileLength,
    organizationId,
    s3Upload,
    s3uploadPassthrough,
    stream,
    userId,
  };
}

function createFileTooLargePromise(
  app: FastifyInstance,
  request: FastifyRequest,
  data: UploadRequestData,
  stream: UploadRequestData["file"],
): Promise<never> {
  const fileTooLargePromise = new Promise<never>((_, reject) => {
    stream.on("limit", () => {
      if (data.file.truncated) {
        request.log.warn({ filename: data.filename }, "file too large");
        reject(app.httpErrors.badRequest("File is too large"));
      }
    });
  });

  fileTooLargePromise.catch(() => {});

  return fileTooLargePromise;
}

function handleUploadError(
  app: FastifyInstance,
  request: FastifyRequest,
  err: unknown,
): never {
  const uploadError = err as HttpError;
  if (uploadError.statusCode === 400) {
    throw app.httpErrors.createError(400, getErrorMessage(err), {
      parent: err,
    });
  }

  request.log.error(err, "error on fileupload");
  throw app.httpErrors.internalServerError("Server error");
}

function createScanPromise(
  app: FastifyInstance,
  request: FastifyRequest,
  antivirusPassthrough: ReturnType<FastifyInstance["avClient"]["passthrough"]>,
): Promise<ScanResult> {
  return new Promise<ScanResult>((resolve, reject) => {
    antivirusPassthrough.on("error", (err) => {
      request.log.error(err, "error in antivirus passthrough");
      reject(app.httpErrors.internalServerError(err.message));
    });

    antivirusPassthrough.once("scan-complete", (result) => {
      request.log.info("end: anti virus scan");
      resolve(result);
    });
  });
}

function createParallelScannedUploadPipeline(
  request: FastifyRequest,
  upload: PreparedUpload,
  antivirusPassthrough: ReturnType<FastifyInstance["avClient"]["passthrough"]>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    request.log.info("begin: file stream (parallel upload + antivirus scan)");

    const cleanup = () => {
      upload.stream.off("error", handleError);
      upload.stream.off("end", handleEnd);
      antivirusPassthrough.off("error", handleError);
      upload.s3uploadPassthrough.off("error", handleError);
    };

    const handleError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const handleEnd = () => {
      cleanup();
      resolve();
    };

    upload.stream.once("error", handleError);
    upload.stream.once("end", handleEnd);
    antivirusPassthrough.once("error", handleError);
    upload.s3uploadPassthrough.once("error", handleError);

    upload.stream.pipe(antivirusPassthrough);
    upload.stream.pipe(upload.s3uploadPassthrough);
  });
}

function createUploadOnlyPipeline(
  request: FastifyRequest,
  upload: PreparedUpload,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    request.log.info("begin: file stream (upload only)");
    pipeline(upload.stream, upload.s3uploadPassthrough, (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

async function runScannedUpload(
  app: FastifyInstance,
  request: FastifyRequest,
  upload: PreparedUpload,
  fileTooLargePromise: Promise<never>,
): Promise<UploadExecutionResult> {
  const getDbVersionPromise = getDbVersion(app.avClient, app.nodeCache);
  const antivirusPassthrough = app.avClient.passthrough({
    emitReadable: false,
  });
  const destroyUploadStreams = (err?: Error) => {
    antivirusPassthrough.destroy(err);
    upload.s3uploadPassthrough.destroy(err);
    upload.stream.destroy(err);
  };
  const scanPromise = createScanPromise(app, request, antivirusPassthrough);
  const streamPipelinePromise = createParallelScannedUploadPipeline(
    request,
    upload,
    antivirusPassthrough,
  );
  const uploadAndScanPromise: Promise<[UploadResult, ScanResult]> = Promise.all(
    [upload.s3Upload.done(), scanPromise, streamPipelinePromise],
  ).then(([uploadedFile, scanResult]) => [uploadedFile, scanResult]);
  const abortOnFileTooLargePromise = fileTooLargePromise.catch((err) => {
    destroyUploadStreams(err as Error);
    throw err;
  });

  try {
    const [uploadResult, scanResult] = await Promise.race([
      uploadAndScanPromise,
      abortOnFileTooLargePromise,
    ]);

    return {
      uploadResult,
      scanResult,
      dbVersion: await getDbVersionPromise,
    };
  } catch (err) {
    return handleUploadError(app, request, err);
  }
}

async function runUnscannedUpload(
  app: FastifyInstance,
  request: FastifyRequest,
  upload: PreparedUpload,
  fileTooLargePromise: Promise<never>,
): Promise<UploadExecutionResult> {
  const streamPipelinePromise = createUploadOnlyPipeline(request, upload);
  const uploadPromise = Promise.all([
    upload.s3Upload.done(),
    streamPipelinePromise,
  ]);
  const abortOnFileTooLargePromise = fileTooLargePromise.catch((err) => {
    upload.s3uploadPassthrough.destroy(err as Error);
    upload.stream.destroy(err as Error);
    throw err;
  });

  try {
    const [uploadResult] = await Promise.race([
      uploadPromise,
      abortOnFileTooLargePromise,
    ]);

    return { uploadResult };
  } catch (err) {
    return handleUploadError(app, request, err);
  }
}

async function insertInfectedUploadMetadata(
  app: FastifyInstance,
  request: FastifyRequest,
  upload: PreparedUpload,
  scanResult: ScanResult,
  dbVersion?: string,
) {
  request.log.info(
    {
      key: upload.fileKey,
      infectionDescription: scanResult.viruses.join(","),
    },
    "file is infected",
  );

  try {
    request.log.info(
      { key: upload.fileKey },
      "begin: deleting infected file from s3",
    );
    await deleteObject(
      app.s3Client.client,
      app.s3Client.bucketName,
      upload.fileKey,
    );
    request.log.info(
      { key: upload.fileKey },
      "end: deleting infected file from s3",
    );
  } catch (error) {
    request.log.error(error, "error deleting infected file from s3");
  }

  request.log.info(
    { key: upload.fileKey },
    "begin: insert infected file scanning metadata",
  );
  await insertFileMetadata(app.pg, {
    id: upload.fileUuid,
    createdAt: new Date(),
    lastScan: new Date(),
    fileSize: upload.getFileLength(),
    infected: true,
    infectionDescription: scanResult.viruses.join(","),
    key: upload.fileKey,
    mimeType: upload.fileMimeType,
    ownerId: upload.userId,
    fileName: upload.filename,
    antivirusDbVersion: dbVersion,
    deleted: true,
    organizationId: upload.organizationId,
  });
  request.log.info(
    { key: upload.fileKey },
    "end: insert infected file scanning metadata",
  );
}

async function insertUploadedFileMetadata(
  app: FastifyInstance,
  request: FastifyRequest,
  upload: PreparedUpload,
  uploadResult: UploadResult,
  dbVersion?: string,
) {
  request.log.info(
    { key: upload.fileKey },
    "begin: insert uploaded file metadata",
  );
  const insertResult = await insertFileMetadata(app.pg, {
    id: upload.fileUuid,
    createdAt: new Date(),
    lastScan: new Date(),
    fileSize: upload.getFileLength(),
    infected: false,
    key: uploadResult.Key as string,
    mimeType: upload.fileMimeType,
    ownerId: upload.userId,
    deleted: false,
    fileName: upload.filename,
    organizationId: upload.organizationId,
    antivirusDbVersion: dbVersion,
    ...(upload.expirationDate ? { expiresAt: upload.expirationDate } : {}),
    ...(upload.externalId ? { external_id: upload.externalId } : {}),
  });
  request.log.info(
    { key: upload.fileKey },
    "end: insert uploaded file metadata",
  );

  return insertResult.rows[0].id;
}

export async function processUpload(
  app: FastifyInstance,
  request: FastifyRequest,
  options: ProcessUploadOptions,
) {
  const upload = await prepareUpload(app, request, options);
  const fileTooLargePromise = createFileTooLargePromise(
    app,
    request,
    upload.data,
    upload.stream,
  );
  const { uploadResult, scanResult, dbVersion } = options.scan
    ? await runScannedUpload(app, request, upload, fileTooLargePromise)
    : await runUnscannedUpload(app, request, upload, fileTooLargePromise);

  if (scanResult?.isInfected) {
    await insertInfectedUploadMetadata(
      app,
      request,
      upload,
      scanResult,
      dbVersion,
    );
    throw app.httpErrors.badRequest("File is infected");
  }

  return insertUploadedFileMetadata(
    app,
    request,
    upload,
    uploadResult,
    dbVersion,
  );
}
