import { httpErrors } from "@fastify/sensible";
import type { Pool } from "pg";
import { profileImportServiceFromPool } from "~/services/profiles/imports/profile-import-service.js";
import type { SavedFileInfo } from "~/utils/save-request-file.js";

export const getProfileImport = async (params: {
  pool: Pool;
  profileImportId: string;
  organisationId?: string;
}): Promise<{
  organisationId: string;
  metadata: SavedFileInfo["metadata"];
  status: string;
  createdAt: string;
}> => {
  const data = await profileImportServiceFromPool(params.pool).get(
    params.profileImportId,
  );
  if (
    params.organisationId !== undefined &&
    data.organisationId !== params.organisationId
  ) {
    throw httpErrors.notFound(
      `Status for profile_import with id ${params.profileImportId} not found`,
    );
  }
  return data;
};
