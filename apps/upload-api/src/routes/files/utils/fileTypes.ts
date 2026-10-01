import { extname } from "node:path";

/**
 * Server-side allowlist mapping every accepted upload extension to the MIME
 * type served on download. The response Content-Type must always come from
 * this map — never from the client-supplied multipart metadata stored with
 * the file — so an uploader cannot make the browser interpret a file as
 * active content (e.g. text/html).
 */
export const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".rtf": "application/rtf",
  ".xml": "application/xml",
  ".json": "application/json",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  // SVG can execute script when rendered inline on the API origin.
  ".svg": "application/octet-stream",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mpeg": "video/mpeg",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wmv": "video/x-ms-wmv",
};

export const ALLOWED_EXTENSIONS = Object.keys(EXTENSION_MIME_TYPES);

const DEFAULT_MIME_TYPE = "application/octet-stream";

export const getResponseMimeType = (filename: string | undefined): string => {
  if (!filename) {
    return DEFAULT_MIME_TYPE;
  }

  const extension = extname(filename).toLowerCase();
  return EXTENSION_MIME_TYPES[extension] ?? DEFAULT_MIME_TYPE;
};
