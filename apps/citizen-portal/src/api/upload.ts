import type { paths } from "@ogcio/api-types/upload"

/**
 * Typed api-client for the upload domain: owns the gateway endpoint paths and
 * re-exports the generated file-metadata DTO. Paths carry the `/upload` gateway
 * prefix (a routing concern added here), which the OpenAPI spec's API-local
 * paths omit.
 */

/** Gateway service prefix that routes to upload-api. */
const GATEWAY_PREFIX = "/upload"

type FileMetadataOk =
  paths["/api/v1/metadata/{id}"]["get"]["responses"][200]["content"]["application/json"]

/** File metadata as returned by `GET /upload/api/v1/metadata/{id}`. */
export type FileMetadata = FileMetadataOk["data"]

export const uploadApi = {
  /** SWR key / fetch path for a single file's metadata. */
  metadataKey(id: string): string {
    return `${GATEWAY_PREFIX}/api/v1/metadata/${id}`
  },

  /** Gateway path for downloading/streaming a file by id. */
  filePath(id: string): string {
    return `${GATEWAY_PREFIX}/api/v1/files/${id}`
  },
}
