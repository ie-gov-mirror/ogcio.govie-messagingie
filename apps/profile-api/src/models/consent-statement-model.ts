import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { RawBuilder } from "kysely";
import type { DB } from "~/db/schema.js";
import type {
  ConsentStatement,
  ConsentStatementTranslation,
} from "~/schemas/consent-statements/shared.js";
import type { PaginationParams } from "~/schemas/pagination.js";

export interface ListConsentStatementsParams {
  subject?: string;
  isEnabled?: boolean;
  pagination: Required<PaginationParams>;
}

/**
 * Data-access model for the `consent_statements` domain. Extends the shared
 * {@link BaseModel} and reproduces the read SQL that previously lived as raw-pg
 * in `consent-statements-service.ts` (single lookup by id, current by subject,
 * current for multiple subjects, the paginated listing, and the distinct
 * available subjects).
 *
 * These reproduce the previous SQL byte-for-byte so response shapes, ordering
 * and pagination stay identical. Only the non-transactional `{ pool }` paths
 * route through this model; the transactional `{ client }` variants and all
 * write paths (create/update/disable) remain on raw pg in the service.
 *
 * No JSON/camelCase workaround is needed here: the translations are plain text
 * columns assembled in JS, not JSONB columns rewritten by the shared
 * `CamelCasePlugin`.
 */
export class ConsentStatementModel extends BaseModel<DB, "consentStatements"> {
  constructor(db: Kysely<DB>) {
    super(db, "consentStatements");
  }

  /** Single statement by id (mirrors the `id` branch of `executeGetConsentStatement`). */
  async getStatementByIdRow(id: string): Promise<ConsentStatement | undefined> {
    const result = await sql<ConsentStatement>`
      SELECT
        cs.id,
        cs.subject,
        cs.version,
        cs.created_at as "createdAt",
        cs.publish_date as "publishDate",
        cs.is_enabled as "isEnabled",
        cs.created_by as "createdBy"
      FROM consent_statements cs
      WHERE id = ${id.trim()}
      ORDER BY publish_date DESC, version DESC, created_at DESC
      LIMIT 1;
    `.execute(this.db);

    return result.rows[0];
  }

  /** Current published+enabled statement by subject (mirrors the `subject` branch). */
  async getCurrentStatementRow(
    subject: string,
  ): Promise<ConsentStatement | undefined> {
    const result = await sql<ConsentStatement>`
      SELECT
        cs.id,
        cs.subject,
        cs.version,
        cs.created_at as "createdAt",
        cs.publish_date as "publishDate",
        cs.is_enabled as "isEnabled",
        cs.created_by as "createdBy"
      FROM consent_statements cs
      WHERE subject = ${subject.trim()} AND publish_date <= NOW() AND is_enabled = true
      ORDER BY publish_date DESC, version DESC, created_at DESC
      LIMIT 1;
    `.execute(this.db);

    return result.rows[0];
  }

  /** Translations for a single statement (mirrors `consentStatementTranslationBaseQuery`). */
  async getTranslationsForStatement(
    statementId: string,
  ): Promise<ConsentStatementTranslation[]> {
    const result = await sql<ConsentStatementTranslation>`
      SELECT
        cst.id,
        cst.consent_statement_id as "consentStatementId",
        cst.language,
        cst.description,
        cst.disclaimer,
        cst.title,
        cst.created_at as "createdAt"
      FROM consent_statement_translations cst
      WHERE consent_statement_id = ${statementId}
    `.execute(this.db);

    return result.rows;
  }

  /**
   * Latest published+enabled statement per subject (mirrors the DISTINCT ON
   * query in `executeGetCurrentConsentStatementForSubjects`).
   */
  async getCurrentStatementsForSubjects(
    subjects: string[],
  ): Promise<ConsentStatement[]> {
    const result = await sql<ConsentStatement>`
      SELECT DISTINCT ON (cs.subject)
        cs.id,
        cs.subject,
        cs.version,
        cs.created_at as "createdAt",
        cs.publish_date as "publishDate",
        cs.is_enabled as "isEnabled",
        cs.created_by as "createdBy"
      FROM consent_statements cs
      WHERE cs.subject = ANY(${subjects}) AND publish_date <= NOW() AND is_enabled = true
      ORDER BY cs.subject, cs.publish_date DESC;
    `.execute(this.db);

    return result.rows;
  }

  /** Translations for multiple statements (mirrors the batched translation read). */
  async getTranslationsForStatements(
    statementIds: string[],
  ): Promise<ConsentStatementTranslation[]> {
    const result = await sql<ConsentStatementTranslation>`
      SELECT
        cst.id,
        cst.consent_statement_id as "consentStatementId",
        cst.language,
        cst.description,
        cst.disclaimer,
        cst.title,
        cst.created_at as "createdAt"
      FROM consent_statement_translations cst
      WHERE consent_statement_id = ANY(${statementIds})
    `.execute(this.db);

    return result.rows;
  }

  /**
   * Count + paginated data read for the listing (mirrors
   * `executeListConsentStatements`). The count runs first so an empty result
   * short-circuits before the data query.
   */
  async listStatements(
    params: ListConsentStatementsParams,
  ): Promise<{ data: ConsentStatement[]; totalCount: number }> {
    const filters: RawBuilder<unknown>[] = [];
    if (params.subject) {
      filters.push(sql`subject = ${params.subject}`);
    }
    if (params.isEnabled !== undefined) {
      filters.push(sql`is_enabled = ${params.isEnabled}`);
    }

    const whereClause =
      filters.length > 0
        ? sql`1=1 AND ${sql.join(filters, sql` AND `)}`
        : sql`1=1`;

    const countResult = await sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM consent_statements
      WHERE ${whereClause}
    `.execute(this.db);

    const totalCount =
      countResult.rows.length === 0 ||
      countResult.rows[0].count === null ||
      Number(countResult.rows[0].count) === 0
        ? 0
        : Number(countResult.rows[0].count);

    if (totalCount === 0) {
      return { data: [], totalCount: 0 };
    }

    const dataResult = await sql<ConsentStatement>`
      SELECT
        cs.id,
        cs.subject,
        cs.version,
        cs.created_at as "createdAt",
        cs.publish_date as "publishDate",
        cs.is_enabled as "isEnabled",
        cs.created_by as "createdBy"
      FROM consent_statements cs
      WHERE ${whereClause}
      ORDER BY publish_date DESC, version DESC, created_at DESC
      LIMIT ${params.pagination.limit}::integer OFFSET ${params.pagination.offset}::integer;
    `.execute(this.db);

    return { data: dataResult.rows, totalCount };
  }

  /** Distinct published+enabled subjects (mirrors `executeGetAvailableConsentSubjects`). */
  async getAvailableSubjects(): Promise<string[]> {
    const result = await sql<{ subject: string }>`
      SELECT DISTINCT subject
      FROM public.consent_statements
      WHERE publish_date <= NOW()
        AND is_enabled = TRUE;
    `.execute(this.db);

    return result.rows.map((row) => row.subject);
  }
}
