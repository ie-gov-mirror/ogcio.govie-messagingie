import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import {
  AnnouncementModel,
  type ListAnnouncementsParams,
  type ListCitizenAnnouncementsParams,
} from "~/models/announcement-model.js";
import type {
  Announcement,
  AnnouncementWithTranslations,
} from "~/schemas/announcements/shared.js";

/**
 * Business logic for the `announcements` read paths. Composes
 * {@link AnnouncementModel} and keeps the not-found handling here so route
 * handlers stay thin.
 *
 * Only the non-transactional reads (`getAnnouncementById`, `listAnnouncements`,
 * `listCitizenAnnouncements` on a pool) are served here; the transactional
 * `{ client }` variants and the write paths remain on raw pg in
 * `announcements-service.ts`.
 */
export class AnnouncementService {
  private readonly model: AnnouncementModel;

  constructor(db: Kysely<DB>) {
    this.model = new AnnouncementModel(db);
  }

  async getById(id: string): Promise<AnnouncementWithTranslations> {
    const announcement = await this.model.getAnnouncementRow(id);
    if (!announcement) {
      throw httpErrors.notFound("Announcement not found");
    }

    const translations = await this.model.getTranslations(announcement.id);
    if (Object.keys(translations).length === 0) {
      throw httpErrors.notFound("No translations found for this announcement");
    }

    return {
      ...announcement,
      translations,
    };
  }

  async list(
    params: ListAnnouncementsParams,
  ): Promise<{ data: Announcement[]; totalCount: number }> {
    return this.model.listAnnouncements(params);
  }

  async listCitizen(
    params: ListCitizenAnnouncementsParams,
  ): Promise<{ data: AnnouncementWithTranslations[]; totalCount: number }> {
    return this.model.listCitizenAnnouncements(params);
  }
}

/**
 * Build an {@link AnnouncementService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers (and tests) that still pass a pool;
 * route handlers construct the service from `app.db` directly.
 */
export const announcementServiceFromPool = (pool: Pool): AnnouncementService =>
  new AnnouncementService(createDbFromPool<DB>(pool));
