import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "~/db/schema.js";
import type { Consent, ConsentSubject } from "~/schemas/consents/shared.js";
import type { PaginationParams } from "~/schemas/pagination.js";

export interface ConsentWithStatementRow extends Consent {
  version: number;
  cascadeReason: string | null;
  cascadeSourceProfileId: string | null;
  sourceProfileEmail: string | null;
  targetProfileEmail: string | null;
}

/**
 * Data-access model for the `profile_consents` domain. Extends the shared
 * {@link BaseModel} and reproduces the read SQL that previously lived as raw-pg
 * in `consents-service.ts` (the per-user paginated listing, the latest-consent
 * lookup, and the per-organisation latest-consent listing).
 *
 * These reproduce the previous SQL byte-for-byte so response shapes, ordering
 * and pagination stay identical. Only the non-transactional `{ pool }` paths
 * route through this model; the transactional `{ client }` variants and the
 * consent-submission/cascade write paths remain on raw pg in the service.
 *
 * No JSON/camelCase workaround is needed: every column is aliased to camelCase
 * in SQL and there are no JSONB columns rewritten by the shared
 * `CamelCasePlugin`.
 */
export class ConsentModel extends BaseModel<DB, "profileConsents"> {
  constructor(db: Kysely<DB>) {
    super(db, "profileConsents");
  }

  /** Count of a user's consents for a subject (mirrors the count in `getConsentsForUser`). */
  async countConsentsForUser(
    userId: string,
    subject: string,
    organisationId?: string,
  ): Promise<number> {
    const result = await sql<{ count: number }>`
      SELECT COUNT(*)
      FROM profile_consents pc
      WHERE pc.profile_id = ${userId}
        AND pc.subject = ${subject}
        AND (
          ${organisationId ?? null}::text IS NULL
          OR EXISTS (
            SELECT 1
            FROM profile_details pd
            WHERE pd.profile_id = pc.profile_id
              AND pd.organisation_id = ${organisationId ?? null}
              AND pd.is_latest = TRUE
          )
        )
    `.execute(this.db);

    return !result.rows[0] || Number(result.rows[0].count ?? 0) === 0
      ? 0
      : Number(result.rows[0].count);
  }

  /** Paginated consents for a user+subject (mirrors the data query in `getConsentsForUser`). */
  async listConsentsForUser(params: {
    userId: string;
    subject: string;
    organisationId?: string;
    pagination: Required<PaginationParams>;
  }): Promise<ConsentWithStatementRow[]> {
    const result = await sql<ConsentWithStatementRow>`
      SELECT pc.id,
        pc.profile_id as "profileId",
        pc.subject,
        pc.status,
        pc.created_at as "createdAt",
        pc.consent_statement_id as "consentStatementId",
        cs.version,
        pc.cascade_reason as "cascadeReason",
        pc.cascade_source_profile_id as "cascadeSourceProfileId",
        source_profile.email as "sourceProfileEmail",
        target_profile.email as "targetProfileEmail"
      FROM profile_consents pc
      JOIN consent_statements cs ON cs.id = pc.consent_statement_id
      LEFT JOIN profiles source_profile ON pc.cascade_source_profile_id = source_profile.id
      LEFT JOIN profiles target_profile ON pc.profile_id = target_profile.id
      WHERE pc.profile_id = ${params.userId}
      AND pc.subject = ${params.subject}
      AND (
        ${params.organisationId ?? null}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM profile_details pd
          WHERE pd.profile_id = pc.profile_id
            AND pd.organisation_id = ${params.organisationId ?? null}
            AND pd.is_latest = TRUE
        )
      )
      ORDER BY pc.created_at DESC
      LIMIT ${params.pagination.limit}::integer OFFSET ${params.pagination.offset}::integer;
    `.execute(this.db);

    return result.rows;
  }

  /** Latest consent for a user across the given subjects (mirrors `executeGetLatestConsentForUser`). */
  async getLatestConsentForUserRows(
    userId: string,
    subjects: ConsentSubject[],
  ): Promise<Consent[]> {
    const result = await sql<Consent>`
      SELECT pc.id,
        pc.profile_id as "profileId",
        pc.subject,
        pc.status,
        pc.created_at as "createdAt",
        pc.consent_statement_id as "consentStatementId"
      FROM profile_consents pc
      WHERE profile_id = ${userId} AND subject = ANY(${subjects})
      ORDER BY created_at DESC
      LIMIT 1;
    `.execute(this.db);

    return result.rows;
  }

  /** Count of distinct profiles with consent for a subject in an org (mirrors `getLatestConsentForUsers`). */
  async countLatestConsentsForUsers(
    subject: string,
    organisationId: string,
  ): Promise<number> {
    const result = await sql<{ count: number }>`
      SELECT COUNT(DISTINCT c.profile_id)
      FROM profile_consents c
      INNER JOIN profile_details d ON c.profile_id = d.profile_id
      WHERE c.subject = ${subject}
        AND d.organisation_id = ${organisationId}
        AND d.is_latest = TRUE
    `.execute(this.db);

    return !result.rows[0] || Number(result.rows[0].count ?? 0) === 0
      ? 0
      : Number(result.rows[0].count);
  }

  /** Latest consent per profile for a subject in an org (mirrors the DISTINCT ON data query). */
  async listLatestConsentsForUsers(params: {
    subject: string;
    organisationId: string;
    pagination: Required<PaginationParams>;
  }): Promise<ConsentWithStatementRow[]> {
    const result = await sql<ConsentWithStatementRow>`
      SELECT DISTINCT ON (c.profile_id)
        c.id,
        c.profile_id as "profileId",
        c.subject,
        c.status,
        c.created_at as "createdAt",
        c.consent_statement_id as "consentStatementId",
        cs.version,
        c.cascade_reason as "cascadeReason",
        c.cascade_source_profile_id as "cascadeSourceProfileId",
        source_profile.email as "sourceProfileEmail",
        target_profile.email as "targetProfileEmail"
      FROM profile_consents c
      JOIN consent_statements cs ON cs.id = c.consent_statement_id
      LEFT JOIN profiles source_profile ON c.cascade_source_profile_id = source_profile.id
      LEFT JOIN profiles target_profile ON c.profile_id = target_profile.id
      INNER JOIN profile_details d
          ON c.profile_id = d.profile_id
      WHERE
          c.subject = ${params.subject}
          AND d.organisation_id = ${params.organisationId}
          AND d.is_latest = TRUE
      ORDER BY c.profile_id, c.created_at DESC
      LIMIT ${params.pagination.limit}::integer OFFSET ${params.pagination.offset}::integer;
    `.execute(this.db);

    return result.rows;
  }
}
