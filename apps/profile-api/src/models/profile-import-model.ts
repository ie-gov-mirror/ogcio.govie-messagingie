import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { RawBuilder } from "kysely";
import type { DB } from "~/db/schema.js";
import type { SavedFileInfo } from "~/utils/save-request-file.js";

export interface ListImportsParams {
  organisationId: string;
  source: "csv" | "json";
  search?: string;
  pagination: { limit: string; offset: string };
}

export interface ProfileImportRow {
  id: string;
  organisationId: string | null;
  status: string;
  metadata: SavedFileInfo["metadata"];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportDetailRow {
  id: string;
  data: unknown;
  status: string;
  batch: number;
}

/**
 * Data-access model for the `profile_imports` domain. Extends the shared
 * {@link BaseModel} for the `profileImports` table and adds the bespoke finders
 * used by the imports routes: the paginated list, the single import lookup and
 * the per-import detail read (from the sibling `profile_import_details` table).
 *
 * The finders reproduce the previous raw-pg SQL verbatim via the shared `sql`
 * tag on `app.db`.
 *
 * Deliberate deviation: `metadata` (imports) and `data` (import details) are
 * JSONB columns whose nested keys must survive verbatim (e.g. the file
 * `filename`/`mimetype` and the profile field keys). The shared Kysely instance
 * runs the `CamelCasePlugin`, which recursively camel-cases nested JSON object
 * keys, so those columns are cast to `::text` here and re-parsed with
 * `JSON.parse`, which the plugin leaves untouched.
 */
export class ProfileImportModel extends BaseModel<DB, "profileImports"> {
  constructor(db: Kysely<DB>) {
    super(db, "profileImports");
  }

  /**
   * Count + paginated data read mirroring the previous `listProfileImports`
   * SQL (optional filename search, organisation and source filters).
   */
  async listImports(
    params: ListImportsParams,
  ): Promise<{ data: ProfileImportRow[]; total: number }> {
    const { organisationId, source, search, pagination } = params;

    const conditions: RawBuilder<unknown>[] = [];
    if (search) {
      conditions.push(sql`metadata->>'filename' ILIKE ${`%${search}%`}::text`);
    }
    conditions.push(sql`organisation_id = ${organisationId}::text`);
    conditions.push(sql`source = ${source}::text`);

    const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    const dataResult = await sql<{
      id: string;
      organisationId: string | null;
      status: string;
      metadata: string;
      source: string;
      createdAt: string;
      updatedAt: string;
    }>`
      SELECT
        id,
        organisation_id as "organisationId",
        status,
        metadata::text as metadata,
        source,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM profile_imports
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${pagination.limit}::integer OFFSET ${pagination.offset}::integer
    `.execute(this.db);

    const countResult = await sql<{ total: string }>`
      SELECT COUNT(*) as total
      FROM profile_imports
      ${whereClause}
    `.execute(this.db);

    return {
      data: dataResult.rows.map((row) => ({
        ...row,
        metadata: JSON.parse(row.metadata) as SavedFileInfo["metadata"],
      })),
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  }

  /**
   * Single import lookup by id. Mirrors the previous `getProfileImport` SQL;
   * returns `undefined` when no row exists.
   */
  async getImport(id: string): Promise<ProfileImportRow | undefined> {
    const result = await sql<{
      id: string;
      organisationId: string | null;
      status: string;
      metadata: string | null;
      source: string;
      createdAt: string;
      updatedAt: string;
    }>`
      SELECT
        id,
        organisation_id as "organisationId",
        status,
        metadata::text as metadata,
        source,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM profile_imports
      WHERE id = ${id}
      LIMIT 1
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      ...row,
      metadata:
        row.metadata === null
          ? (null as unknown as SavedFileInfo["metadata"])
          : (JSON.parse(row.metadata) as SavedFileInfo["metadata"]),
    };
  }

  /**
   * Per-import detail read. Mirrors the previous `getProfileImportDetails` SQL
   * (only rows with non-null `data`, optionally scoped to a batch, ordered by
   * id). Returns the raw parsed rows; validation happens in the service.
   */
  async listImportDetails(
    id: string,
    batch?: number,
  ): Promise<ImportDetailRow[]> {
    const batchFilter =
      batch !== undefined ? sql`AND batch_number = ${batch}` : sql``;

    const result = await sql<{
      id: string;
      data: string;
      status: string;
      batch: number;
    }>`
      SELECT id, data::text as data, status, batch_number as batch
      FROM profile_import_details
      WHERE profile_import_id = ${id}
      AND data IS NOT NULL
      ${batchFilter}
      ORDER BY id
    `.execute(this.db);

    return result.rows.map((row) => ({
      ...row,
      data: JSON.parse(row.data),
    }));
  }
}
