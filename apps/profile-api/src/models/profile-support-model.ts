import { BaseModel, type Kysely } from "@ogcio/db-core";
import { CompiledQuery } from "kysely";
import type { DB } from "~/db/schema.js";
import type {
  ConsentStatus,
  ConsentSubject,
} from "~/schemas/consents/shared.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import type { SupportSearchBody } from "~/schemas/profiles/support.js";
import { buildSupportSearchQueries } from "~/services/profiles/sql/build-support-search-queries.js";

export interface SupportSearchRow {
  id: string;
  publicName: string;
  organisationId: string | null;
  profileDetailsId: string;
  primaryUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  preferredLanguage: string;
  safeLevel: number;
  status: string;
  consentStatuses: Record<
    ConsentSubject,
    {
      status: ConsentStatus;
      consent_statement_id: string;
    }
  >;
}

export interface SupportProfileDataRow {
  profileDetailsId: string;
  name: string;
  value: string;
}

/**
 * Data-access model for the support profile search. Extends the shared
 * {@link BaseModel} and reproduces the read SQL that previously lived as raw-pg
 * in `services/profiles/support.ts` (the dynamic count + paginated search built
 * by {@link buildSupportSearchQueries}, plus the profile-data lookup).
 *
 * The prebuilt parametrised query strings are executed verbatim via
 * `CompiledQuery.raw` so the SQL and positional parameters stay identical.
 *
 * JSON/camelCase note: `consent_statuses` is a JSONB column whose nested keys
 * must survive verbatim (notably the legacy `consent_statement_id`). The shared
 * Kysely instance runs the `CamelCasePlugin`, which recursively camel-cases
 * nested JSON keys, so the column is selected as `::text` (see
 * {@link buildSupportSearchQueries}) and re-parsed here with `JSON.parse`.
 */
export class ProfileSupportModel extends BaseModel<DB, "profiles"> {
  constructor(db: Kysely<DB>) {
    super(db, "profiles");
  }

  /** Count + paginated support-search rows (mirrors the count/data queries in `supportSearch`). */
  async search(params: {
    body: SupportSearchBody;
    pagination: Required<PaginationParams>;
  }): Promise<{ rows: SupportSearchRow[]; total: number }> {
    const queries = buildSupportSearchQueries(params);

    const countResult = await this.db.executeQuery<{ count: string }>(
      CompiledQuery.raw(queries.count.query, queries.count.values),
    );

    const total = Number(countResult.rows[0]?.count ?? 0);
    if (total === 0) {
      return { rows: [], total: 0 };
    }

    const dataResult = await this.db.executeQuery<
      Omit<SupportSearchRow, "consentStatuses"> & {
        consentStatuses: string | null;
      }
    >(CompiledQuery.raw(queries.data.query, queries.data.values));

    const rows = dataResult.rows.map((row) => {
      const { consentStatuses, ...rest } = row;
      return {
        ...rest,
        consentStatuses:
          typeof consentStatuses === "string"
            ? (JSON.parse(
                consentStatuses,
              ) as SupportSearchRow["consentStatuses"])
            : ({} as SupportSearchRow["consentStatuses"]),
      };
    });

    return { rows, total };
  }

  /** Profile-data string fields for the given profile-details ids (mirrors the `profile_data` read). */
  async getProfileDataForDetails(
    profileDetailsIds: string[],
  ): Promise<SupportProfileDataRow[]> {
    const result = await this.db.executeQuery<SupportProfileDataRow>(
      CompiledQuery.raw(
        `SELECT
        pdata.profile_details_id AS "profileDetailsId",
        pdata.name,
        pdata.value
      FROM profile_data pdata
      WHERE pdata.profile_details_id = ANY($1)
        AND pdata.name IN ('email', 'ppsn', 'dateOfBirth', 'firstName', 'lastName')`,
        [profileDetailsIds],
      ),
    );

    return result.rows;
  }
}
