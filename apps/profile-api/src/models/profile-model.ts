import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { RawBuilder } from "kysely";
import type { DB } from "~/db/schema.js";
import type { ListProfilesSearchParams } from "~/schemas/profiles/list.js";
import type {
  ConsentStatusDetail,
  LinkedProfile,
  ProfileWithDetailsFromDb,
} from "~/schemas/profiles/model.js";
import type { ProfileWithEnhancedConsent } from "~/services/profiles/sql/find-profile-with-enhanced-consent.js";
import { toIsoDateTime } from "~/utils/dates.js";

export interface ListProfilesParams {
  organisationId: string | undefined;
  pagination: { limit: string; offset: string };
  searchParams?: Omit<ListProfilesSearchParams, "consentSubjects"> & {
    ppsns?: string[];
  };
  activeOnly?: boolean;
  consentSubjects: string[];
}

export interface FindProfileParams {
  organizationId: string;
  query: Record<string, string>;
  consentSubjects: string[];
}

export interface SelectProfilesParams {
  organizationId: string;
  profileIds: string[];
  consentSubjects: string[];
}

export interface EnhancedConsentParams {
  organizationId: string | undefined;
  profileId: string;
  consentSubjects: string[];
}

export type ProfileDataMap = Record<
  string,
  { firstName?: string; lastName?: string; ppsn?: string; email?: string }
>;

// The list/select queries expose `consentStatuses` as text (see the model
// methods for why); everything else matches the existing `ProfileWithDetailsFromDb`.
type ListRow = Omit<ProfileWithDetailsFromDb, "consentStatuses" | "details"> & {
  consentStatuses: string | null;
};

// The find query additionally selects `details` and `safeLevel` but does not
// project a `profileDetailsId`.
type FindRow = Omit<
  ProfileWithDetailsFromDb,
  "consentStatuses" | "profileDetailsId"
> & { consentStatuses: string | null };

/**
 * Data-access model for the `profiles` domain. Extends the shared
 * {@link BaseModel} for generic CRUD and adds bespoke finders that reproduce the
 * hand-written SQL previously living in the profiles services (the paginated
 * list with dynamic search filters, the id-scoped select, the single-profile
 * find and the enhanced-consent read).
 *
 * The queries drop to the exported `sql` template because they rely on dynamic
 * WHERE clauses, JSONB aggregation and consent CTEs the query builder can't
 * express cleanly; they are kept byte-for-byte equivalent to the previous
 * raw-pg SQL so API responses and behaviour stay unchanged.
 *
 * One deliberate deviation: `consent_statuses` is a JSONB column whose nested
 * keys must survive verbatim (e.g. the legacy `consent_statement_id`). The
 * shared Kysely instance runs the `CamelCasePlugin`, which recursively
 * camel-cases nested JSON object keys. To avoid corrupting those keys the
 * column is cast to `::text` in SQL and re-parsed here with `JSON.parse`, which
 * the plugin leaves untouched.
 */
export class ProfileModel extends BaseModel<DB, "profiles"> {
  constructor(db: Kysely<DB>) {
    super(db, "profiles");
  }

  /**
   * Count + paginated data read mirroring the previous
   * `buildListProfilesQueries` + `listProfiles` SQL. Returns the raw profile
   * rows (details are merged in by the service via {@link getProfileDataMap}).
   * The count runs first so an empty result short-circuits before the data
   * query, exactly like the previous implementation.
   */
  async listRows(
    params: ListProfilesParams,
  ): Promise<{ rows: ProfileWithDetailsFromDb[]; total: number }> {
    const baseQuery = this.buildListBaseQuery(params);

    const countResult = await sql<{ count: number }>`
      SELECT COUNT(DISTINCT p.id) as count ${baseQuery}
    `.execute(this.db);

    const total = Number(countResult.rows[0]?.count ?? 0);
    if (total === 0) {
      return { rows: [], total: 0 };
    }

    const { consentSubjects, pagination } = params;
    const dataResult = await sql<ListRow>`
      SELECT DISTINCT
        p.id,
        p.public_name as "publicName",
        p.email,
        p.primary_user_id as "primaryUserId",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        p.preferred_language as "preferredLanguage",
        pd.id as "profileDetailsId",
        p.status,
        (CASE
          WHEN array_length(${consentSubjects}::text[], 1) IS NULL OR p.consent_statuses IS NULL THEN NULL
          ELSE (
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(p.consent_statuses)
            WHERE key = ANY(${consentSubjects}::text[])
          )
        END)::text AS "consentStatuses"
      ${baseQuery}
      ORDER BY p.created_at DESC
      LIMIT ${pagination.limit} OFFSET ${pagination.offset}
    `.execute(this.db);

    return {
      rows: dataResult.rows.map((row) => this.withParsedConsent(row)),
      total,
    };
  }

  /**
   * Bulk read of profiles by id, scoped to an organisation. Mirrors the
   * previous `selectProfilesWithData` SQL (details merged in by the service).
   */
  async selectRows(
    params: SelectProfilesParams,
  ): Promise<ProfileWithDetailsFromDb[]> {
    const { organizationId, profileIds, consentSubjects } = params;
    const result = await sql<ListRow>`
      SELECT
        p.id,
        p.public_name as "publicName",
        p.email,
        p.primary_user_id as "primaryUserId",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        p.preferred_language as "preferredLanguage",
        pd.id as "profileDetailsId",
        p.status,
        (CASE
          WHEN array_length(${consentSubjects}::text[], 1) IS NULL OR p.consent_statuses IS NULL THEN NULL
          ELSE (
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(p.consent_statuses)
            WHERE key = ANY(${consentSubjects}::text[])
          )
        END)::text AS "consentStatuses"
      FROM profiles p
      INNER JOIN profile_details pd ON pd.profile_id = p.id
      WHERE p.id = ANY(${profileIds})
      AND pd.organisation_id = ${organizationId}
      AND pd.is_latest = true
      AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `.execute(this.db);

    return result.rows.map((row) => this.withParsedConsent(row));
  }

  /**
   * Fetch the `firstName`/`lastName`/`ppsn`/`email` string details for the
   * given profile-details ids. Mirrors `selectProfileDataForProfileDetailIds`.
   */
  async getProfileDataMap(
    profileDetailsIds: string[],
  ): Promise<ProfileDataMap> {
    const map: ProfileDataMap = {};
    if (profileDetailsIds.length === 0) {
      return map;
    }

    const result = await sql<{
      profileDetailsId: string;
      name: string;
      value: string;
    }>`
      SELECT
        pdata.profile_details_id as "profileDetailsId",
        pdata.name,
        pdata.value
      FROM profile_data pdata
      WHERE pdata.profile_details_id = ANY(${profileDetailsIds})
      AND pdata.value_type = 'string'
      AND pdata.name IN ('firstName', 'lastName', 'ppsn', 'email')
    `.execute(this.db);

    for (const row of result.rows) {
      if (!map[row.profileDetailsId]) {
        map[row.profileDetailsId] = {};
      }
      map[row.profileDetailsId][
        row.name as "firstName" | "lastName" | "ppsn" | "email"
      ] = row.value;
    }

    return map;
  }

  /**
   * Single-profile lookup by dynamic search criteria, scoped to an
   * organisation. Mirrors the previous `findProfile` SQL (details are embedded
   * in the row via a correlated JSONB aggregate).
   */
  async findRow(
    params: FindProfileParams,
  ): Promise<Omit<ProfileWithDetailsFromDb, "profileDetailsId"> | undefined> {
    const { organizationId, query, consentSubjects } = params;
    const { email, firstName, lastName, phone } = query;

    const conditions: RawBuilder<unknown>[] = [];
    if (email) {
      const like = `%${email}%`;
      conditions.push(sql`(p.email ILIKE ${like} OR EXISTS (
            SELECT 1 FROM profile_data pd
            WHERE pd.profile_details_id = pdet.id
            AND pd.name = 'email'
            AND pd.value_type = 'string'
            AND pd.value ILIKE ${like}
          ))`);
    }
    if (firstName) {
      const like = `%${firstName}%`;
      conditions.push(sql`EXISTS (
            SELECT 1 FROM profile_data pd
            WHERE pd.profile_details_id = pdet.id
            AND pd.name = 'firstName'
            AND pd.value_type = 'string'
            AND pd.value ILIKE ${like}
          )`);
    }
    if (lastName) {
      const like = `%${lastName}%`;
      conditions.push(sql`EXISTS (
            SELECT 1 FROM profile_data pd
            WHERE pd.profile_details_id = pdet.id
            AND pd.name = 'lastName'
            AND pd.value_type = 'string'
            AND pd.value ILIKE ${like}
          )`);
    }
    if (phone) {
      const like = `%${phone}%`;
      conditions.push(sql`EXISTS (
            SELECT 1 FROM profile_data pd
            WHERE pd.profile_details_id = pdet.id
            AND pd.name = 'phone'
            AND pd.value_type = 'string'
            AND pd.value ILIKE ${like}
          )`);
    }

    const whereClause =
      conditions.length > 0
        ? sql`AND (${sql.join(conditions, sql` AND `)})`
        : sql``;

    const result = await sql<FindRow>`
          SELECT DISTINCT
            p.id,
            p.public_name as "publicName",
            p.email,
            p.primary_user_id as "primaryUserId",
            p.safe_level as "safeLevel",
            p.created_at as "createdAt",
            p.updated_at as "updatedAt",
            p.preferred_language as "preferredLanguage",
            p.status,
            (CASE
            WHEN array_length(${consentSubjects}::text[], 1) IS NULL OR p.consent_statuses IS NULL THEN NULL
            ELSE (
              SELECT jsonb_object_agg(key, value)
              FROM jsonb_each(p.consent_statuses)
              WHERE key = ANY(${consentSubjects}::text[])
            ) END)::text AS "consentStatuses",
            (
              SELECT jsonb_object_agg(pdata.name,
                jsonb_build_object(
                  'value', pdata.value,
                  'type', pdata.value_type
                )
              )
              FROM profile_data pdata
              WHERE pdata.profile_details_id = pdet.id
            ) as details
          FROM profiles p
          INNER JOIN profile_details pdet
            ON pdet.profile_id = p.id
            AND pdet.organisation_id = ${organizationId}
            AND pdet.is_latest = true
          WHERE p.deleted_at IS NULL
          ${whereClause}
          ORDER BY p.created_at DESC
          LIMIT 1
        `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return this.withParsedConsent(row);
  }

  /**
   * Enhanced-consent single-profile read used by the `GET /:profileId` route.
   * Mirrors `findProfileWithEnhancedConsent`: profile + details, then (only when
   * consent subjects are requested and consent data exists) the latest consent
   * per subject with statement-version freshness.
   */
  async findWithEnhancedConsent(
    params: EnhancedConsentParams,
  ): Promise<ProfileWithEnhancedConsent | undefined> {
    const { organizationId, profileId, consentSubjects } = params;

    const organisationClause =
      organizationId !== undefined ? sql`= ${organizationId}` : sql`IS NULL`;

    const profileResult = await sql<
      Omit<ProfileWithEnhancedConsent, "consentStatuses">
    >`
    SELECT
      p.id,
      p.public_name as "publicName",
      p.email,
      p.primary_user_id as "primaryUserId",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
      p.preferred_language as "preferredLanguage",
      p.status,
      (
        SELECT jsonb_object_agg(pdata.name,
        jsonb_build_object(
            'value', pdata.value,
            'type', pdata.value_type
        )
        )
        FROM profile_data pdata
        INNER JOIN profile_details pd ON pd.id = pdata.profile_details_id
        WHERE pd.profile_id = p.id
        AND pd.organisation_id ${organisationClause}
        AND pd.is_latest = true
      ) as details
    FROM profiles p
    WHERE p.id = ${profileId}
    AND p.deleted_at IS NULL
    `.execute(this.db);

    const profile = profileResult.rows[0];
    if (!profile) {
      return undefined;
    }

    if (!consentSubjects || consentSubjects.length === 0) {
      return { ...profile, consentStatuses: null };
    }

    const consentExistsResult = await sql<{ hasConsentData: boolean }>`
    SELECT EXISTS(
      SELECT 1
      FROM profile_consents pc
      WHERE pc.profile_id = ${profileId}
      AND pc.subject = ANY(${consentSubjects}::text[])
      LIMIT 1
    ) as "hasConsentData"
    `.execute(this.db);

    if (!consentExistsResult.rows[0]?.hasConsentData) {
      return { ...profile, consentStatuses: null };
    }

    const consentResult = await sql<{
      subject: string;
      status: ConsentStatusDetail["status"];
      submittedAt: string;
      statementId: string;
      statementVersion: number;
      isLatestStatement: boolean;
    }>`
    WITH latest_consents AS (
      SELECT DISTINCT ON (pc.subject)
        pc.subject,
        pc.status,
        pc.created_at as submitted_at,
        pc.consent_statement_id as statement_id,
        cs.version as statement_version
      FROM profile_consents pc
      JOIN consent_statements cs ON cs.id = pc.consent_statement_id
      WHERE pc.profile_id = ${profileId}
      AND pc.subject = ANY(${consentSubjects}::text[])
      ORDER BY pc.subject, pc.created_at DESC
    ),
    latest_statements AS (
      SELECT DISTINCT ON (cs.subject)
        cs.subject,
        cs.id as latest_statement_id,
        cs.version as latest_version
      FROM consent_statements cs
      WHERE cs.subject = ANY(${consentSubjects}::text[])
      AND cs.is_enabled = true
      AND cs.publish_date <= NOW()
      ORDER BY cs.subject, cs.publish_date DESC, cs.version DESC
    )
    SELECT
      lc.subject as subject,
      lc.status,
      lc.submitted_at as "submittedAt",
      lc.statement_id as "statementId",
      lc.statement_version as "statementVersion",
      CASE
        WHEN ls.latest_statement_id = lc.statement_id THEN true
        ELSE false
      END as "isLatestStatement"
    FROM latest_consents lc
    LEFT JOIN latest_statements ls ON ls.subject = lc.subject
    `.execute(this.db);

    const consentStatuses: Record<string, ConsentStatusDetail> = {};
    for (const row of consentResult.rows) {
      consentStatuses[row.subject] = {
        subject: row.subject,
        status: row.status,
        submittedAt: toIsoDateTime(row.submittedAt),
        statementId: row.statementId,
        statementVersion: row.statementVersion,
        isLatestStatement: row.isLatestStatement,
      };
    }

    return {
      ...profile,
      consentStatuses:
        Object.keys(consentStatuses).length > 0 ? consentStatuses : null,
    };
  }

  /** Fetch the linked profiles for a primary user. Mirrors `getLinkedProfiles`. */
  async getLinkedProfiles(primaryUserId: string): Promise<LinkedProfile[]> {
    const result = await sql<LinkedProfile>`
      SELECT
        p.id,
        p.public_name as "publicName",
        p.email
      FROM profiles p
      WHERE p.primary_user_id = ${primaryUserId}
      AND p.id != ${primaryUserId}
      AND p.deleted_at IS NULL
    `.execute(this.db);

    return result.rows;
  }

  /**
   * Shared FROM/JOIN/WHERE fragment for the list count and data queries.
   * Reproduces `buildListProfilesQueries`'s dynamic org filter, optional
   * `profile_data` join and search predicates.
   */
  private buildListBaseQuery(params: ListProfilesParams): RawBuilder<unknown> {
    const { organisationId, searchParams, activeOnly } = params;

    const orgFilter = organisationId
      ? sql` AND pd.organisation_id = ${organisationId} `
      : sql``;

    const needsProfileData = Boolean(
      searchParams?.search ||
        searchParams?.firstName ||
        searchParams?.lastName ||
        searchParams?.email ||
        (searchParams?.ppsns && searchParams.ppsns.length > 0),
    );
    const profileDataJoin = needsProfileData
      ? sql` INNER JOIN profile_data pdata ON pdata.profile_details_id = pd.id `
      : sql``;

    const activeFilter = activeOnly ? sql` AND p.deleted_at IS NULL ` : sql``;
    const searchFilters = this.buildListSearchFilters(searchParams);

    return sql`
      FROM profiles p
      INNER JOIN profile_details pd ON pd.profile_id = p.id
      ${profileDataJoin}
      WHERE
       pd.is_latest = true
       ${orgFilter}
      ${activeFilter}
      ${searchFilters}
    `;
  }

  /** Dynamic search WHERE fragment for the list query (mirrors `prepareWhereClauses`). */
  private buildListSearchFilters(
    searchParams: ListProfilesParams["searchParams"],
  ): RawBuilder<unknown> {
    const whereClauses: RawBuilder<unknown>[] = [];

    const search = searchParams?.search?.trim() || "";
    const firstName = searchParams?.firstName?.trim() || "";
    const lastName = searchParams?.lastName?.trim() || "";
    const email = searchParams?.email?.trim() || "";
    const ppsns = searchParams?.ppsns?.length
      ? searchParams.ppsns.filter((ppsn) => ppsn.trim().length > 0)
      : [];

    if (search.length > 0) {
      const like = `%${search}%`;
      whereClauses.push(sql`(
        p.email ILIKE ${like} OR
        p.public_name ILIKE ${like} OR
        EXISTS (
          SELECT 1 FROM profile_data pde
          WHERE pde.profile_details_id = pd.id
          AND pde.value_type = 'string'
          AND pde.value ILIKE ${like}
        )
      )`);
    }

    const fieldClauses: RawBuilder<unknown>[] = [];
    if (firstName.length > 0) {
      const like = `%${firstName}%`;
      fieldClauses.push(sql`(
      p.public_name ILIKE ${like} OR
      EXISTS (
      SELECT 1 FROM profile_data pde
      WHERE pde.profile_details_id = pd.id
        AND pde.name = 'firstName'
        AND pde.value_type = 'string'
        AND pde.value ILIKE ${like}
    )
    )`);
    }
    if (lastName.length > 0) {
      const like = `%${lastName}%`;
      fieldClauses.push(sql`(
      p.public_name ILIKE ${like} OR
       EXISTS (
      SELECT 1 FROM profile_data pde
      WHERE pde.profile_details_id = pd.id
        AND pde.name = 'lastName'
        AND pde.value_type = 'string'
        AND pde.value ILIKE ${like}
    )
    )`);
    }
    if (email.length > 0) {
      const like = `%${email}%`;
      fieldClauses.push(sql`(
       EXISTS (
      SELECT 1 FROM profile_data pde
      WHERE pde.profile_details_id = pd.id
        AND pde.name = 'email'
        AND pde.value_type = 'string'
        AND pde.value ILIKE ${like}
    )
    )`);
    }
    if (ppsns.length > 0) {
      fieldClauses.push(sql`(
      pde.name = 'ppsn' AND pde.value = ANY(${ppsns})
    )`);
    }

    if (fieldClauses.length > 0) {
      whereClauses.push(sql`EXISTS (
      SELECT 1 FROM profile_data pde
      WHERE pde.profile_details_id = pd.id
        AND ${sql.join(fieldClauses, sql` AND `)}
    )`);
    }

    if (whereClauses.length === 0) {
      return sql``;
    }
    return sql` AND ${sql.join(whereClauses, sql` AND `)} `;
  }

  /** Re-parse the text-encoded `consentStatuses` column into its original JSON. */
  private withParsedConsent<T extends { consentStatuses: string | null }>(
    row: T,
  ): Omit<T, "consentStatuses"> & {
    consentStatuses: ProfileWithDetailsFromDb["consentStatuses"];
  } {
    const { consentStatuses, ...rest } = row;
    return {
      ...rest,
      consentStatuses:
        typeof consentStatuses === "string"
          ? (JSON.parse(
              consentStatuses,
            ) as ProfileWithDetailsFromDb["consentStatuses"])
          : null,
    };
  }
}
