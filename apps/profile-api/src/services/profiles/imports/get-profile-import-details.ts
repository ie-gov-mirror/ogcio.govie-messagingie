import type { Pool } from "pg";
import type { ProfileImportDetail } from "~/schemas/profiles/model.js";
import { profileImportServiceFromPool } from "./profile-import-service.js";

export const getProfileImportDetails = async (
  pool: Pool,
  importId: string,
): Promise<ProfileImportDetail[]> =>
  profileImportServiceFromPool(pool).getDetails(importId);
