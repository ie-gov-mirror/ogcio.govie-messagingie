import type { Pool } from "pg";
import type { ProfileImportRow } from "~/models/profile-import-model.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import { profileImportServiceFromPool } from "./profile-import-service.js";

interface ListProfileImportsParams {
  pool: Pool;
  organisationId: string;
  source?: "csv" | "json";
  search?: string;
  pagination: Required<PaginationParams>;
}

export async function listProfileImports({
  pool,
  organisationId,
  source = "csv",
  search,
  pagination,
}: ListProfileImportsParams): Promise<{
  data: ProfileImportRow[];
  total: number;
}> {
  return profileImportServiceFromPool(pool).list({
    organisationId,
    source,
    search,
    pagination,
  });
}
