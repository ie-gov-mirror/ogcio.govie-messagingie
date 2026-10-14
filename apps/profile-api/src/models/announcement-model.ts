import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { RawBuilder } from "kysely";
import type { DB } from "~/db/schema.js";
import type {
  Announcement,
  AnnouncementLanguage,
  AnnouncementTranslation,
  AnnouncementWithTranslations,
} from "~/schemas/announcements/shared.js";
import type { PaginationParams } from "~/schemas/pagination.js";

export interface ListAnnouncementsParams {
  applicationId?: string;
  isEnabled?: boolean;
  pagination: Required<PaginationParams>;
}

export interface ListCitizenAnnouncementsParams {
  profileId: string;
  applicationId: string;
  newOnly: boolean;
  pagination: Required<PaginationParams>;
}

/**
 * Data-access model for the `announcements` domain. Extends the shared
 * {@link BaseModel} and adds the read finders that previously lived as raw-pg
 * SQL in `announcements-service.ts` (single-announcement lookup + translations,
 * the paginated support listing with dynamic filters, and the citizen listing
 * CTE).
 *
 * These reproduce the previous SQL byte-for-byte so response shapes,
 * ordering and pagination stay identical. Only the non-transactional `{ pool }`
 * paths route through this model; the transactional `{ client }` variants and
 * all write paths (create/enable/acknowledge) remain on raw pg in the service.
 *
 * JSON/camelCase note: the citizen listing builds a `translations` JSONB object
 * whose nested keys (`id`, `announcementId`, `language`, `title`,
 * `description`, `createdAt`) are already camelCase, so the shared
 * `CamelCasePlugin` is a no-op on them and no `::text` round-trip is needed.
 */
export class AnnouncementModel extends BaseModel<DB, "announcements"> {
  constructor(db: Kysely<DB>) {
    super(db, "announcements");
  }

  /** Single announcement row by id (mirrors `announcementBaseQuery`). */
  async getAnnouncementRow(id: string): Promise<Announcement | undefined> {
    const result = await sql<Announcement>`
      SELECT
        a.id,
        a.application_id as "applicationId",
        a.is_enabled as "isEnabled",
        a.publish_date as "publishDate",
        a.created_at as "createdAt",
        a.created_by as "createdBy"
      FROM announcements a
      WHERE a.id = ${id}
    `.execute(this.db);

    return result.rows[0];
  }

  /**
   * Translations keyed by language for an announcement (mirrors
   * `getAnnouncementTranslations`, minus the not-found throw which stays in the
   * service).
   */
  async getTranslations(
    announcementId: string,
  ): Promise<Record<AnnouncementLanguage, AnnouncementTranslation>> {
    const result = await sql<AnnouncementTranslation>`
      SELECT
        at.id,
        at.announcement_id as "announcementId",
        at.language,
        at.title,
        at.description,
        at.created_at as "createdAt"
      FROM announcement_translations at
      WHERE announcement_id = ${announcementId}
    `.execute(this.db);

    return result.rows.reduce<
      Record<AnnouncementLanguage, AnnouncementTranslation>
    >(
      (acc, translation) => {
        acc[translation.language] = translation;
        return acc;
      },
      {} as Record<AnnouncementLanguage, AnnouncementTranslation>,
    );
  }

  /**
   * Count + paginated data read for the support listing (mirrors
   * `executeListAnnouncements`). The count runs first so an empty result
   * short-circuits before the data query.
   */
  async listAnnouncements(
    params: ListAnnouncementsParams,
  ): Promise<{ data: Announcement[]; totalCount: number }> {
    const filters: RawBuilder<unknown>[] = [];
    if (params.applicationId) {
      filters.push(sql`a.application_id = ${params.applicationId}`);
    }
    if (params.isEnabled !== undefined) {
      filters.push(sql`a.is_enabled = ${params.isEnabled}`);
    }

    const whereClause =
      filters.length > 0
        ? sql`1=1 AND ${sql.join(filters, sql` AND `)}`
        : sql`1=1`;

    const countResult = await sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM announcements a
      WHERE ${whereClause}
    `.execute(this.db);

    const totalCount =
      countResult.rows.length === 0 || countResult.rows[0].count === null
        ? 0
        : Number(countResult.rows[0].count);

    if (totalCount === 0) {
      return { data: [], totalCount: 0 };
    }

    const dataResult = await sql<Announcement>`
      SELECT
        a.id,
        a.application_id as "applicationId",
        a.is_enabled as "isEnabled",
        a.publish_date as "publishDate",
        a.created_at as "createdAt",
        a.created_by as "createdBy"
      FROM announcements a
      WHERE ${whereClause}
      ORDER BY a.publish_date DESC, a.created_at DESC
      LIMIT ${params.pagination.limit}::integer OFFSET ${params.pagination.offset}::integer
    `.execute(this.db);

    return { data: dataResult.rows, totalCount };
  }

  /**
   * Citizen-facing announcement listing (mirrors
   * `executeListCitizenAnnouncements`): a single CTE query that applies the
   * first-citizen-profile cutoff, publish/enabled filters, optional
   * new-only acknowledgement filtering, and aggregates translations.
   */
  async listCitizenAnnouncements(
    params: ListCitizenAnnouncementsParams,
  ): Promise<{ data: AnnouncementWithTranslations[]; totalCount: number }> {
    const { applicationId, profileId, newOnly, pagination } = params;

    const result = await sql<
      Announcement & {
        totalCount: string;
        translations: Record<AnnouncementLanguage, AnnouncementTranslation>;
      }
    >`
      WITH first_citizen_profile AS (
        SELECT pd.created_at as cutoff
        FROM profile_details pd
        WHERE pd.profile_id = ${profileId} AND pd.organisation_id IS NULL
        ORDER BY pd.created_at ASC
        LIMIT 1
      ),
      paged_announcements AS (
        SELECT
          a.id,
          a.application_id as "applicationId",
          a.is_enabled as "isEnabled",
          a.publish_date as "publishDate",
          a.created_at as "createdAt",
          a.created_by as "createdBy",
          COUNT(*) OVER() as "totalCount"
        FROM announcements a
        WHERE a.application_id = ${applicationId}
          AND a.is_enabled = true
          AND a.publish_date <= NOW()
          AND a.publish_date > COALESCE(
            (SELECT cutoff FROM first_citizen_profile),
            '-infinity'::timestamptz
          )
          AND (
            NOT ${newOnly}::boolean
            OR NOT EXISTS (
              SELECT 1
              FROM announcement_acknowledgements aa
              WHERE aa.announcement_id = a.id AND aa.profile_id = ${profileId}
            )
          )
        ORDER BY a.publish_date DESC, a.created_at DESC
        LIMIT ${pagination.limit}::integer OFFSET ${pagination.offset}::integer
      )
      SELECT
        pa.id,
        pa."applicationId",
        pa."isEnabled",
        pa."publishDate",
        pa."createdAt",
        pa."createdBy",
        pa."totalCount",
        COALESCE(
          jsonb_object_agg(
            at.language,
            jsonb_build_object(
              'id', at.id,
              'announcementId', at.announcement_id,
              'language', at.language,
              'title', at.title,
              'description', at.description,
              'createdAt', at.created_at
            )
          ) FILTER (WHERE at.id IS NOT NULL),
          '{}'::jsonb
        ) as translations
      FROM paged_announcements pa
      LEFT JOIN announcement_translations at ON at.announcement_id = pa.id
      GROUP BY
        pa.id,
        pa."applicationId",
        pa."isEnabled",
        pa."publishDate",
        pa."createdAt",
        pa."createdBy",
        pa."totalCount"
      ORDER BY pa."publishDate" DESC, pa."createdAt" DESC
    `.execute(this.db);

    if (result.rows.length === 0) {
      return { data: [], totalCount: 0 };
    }

    return {
      data: result.rows.map(
        ({ totalCount: _totalCount, ...announcement }) => announcement,
      ),
      totalCount: Number(result.rows[0].totalCount),
    };
  }
}
