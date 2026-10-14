import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import {
  ConsentModel,
  type ConsentWithStatementRow,
} from "~/models/consent-model.js";
import type {
  Consent,
  ConsentSubject,
  ConsentWithStatement,
} from "~/schemas/consents/shared.js";
import type { PaginationParams } from "~/schemas/pagination.js";

const toConsentWithStatement = (
  row: ConsentWithStatementRow,
): ConsentWithStatement => ({
  id: row.id,
  profileId: row.profileId,
  subject: row.subject,
  status: row.status,
  createdAt: row.createdAt,
  consentStatementId: row.consentStatementId,
  consentStatement: {
    version: row.version,
  },
  cascadeReason: row.cascadeReason,
  cascadeSourceProfileId: row.cascadeSourceProfileId,
  sourceProfileEmail: row.sourceProfileEmail,
  targetProfileEmail: row.targetProfileEmail,
});

/**
 * Business logic for the `profile_consents` read paths. Composes
 * {@link ConsentModel} and keeps the response shaping (statement version
 * embedding) here so route handlers stay thin.
 *
 * Only the non-transactional reads served on a pool route here; the
 * transactional `{ client }` variants and the consent-submission/cascade write
 * paths remain on raw pg in `consents-service.ts`.
 */
export class ConsentService {
  private readonly model: ConsentModel;

  constructor(db: Kysely<DB>) {
    this.model = new ConsentModel(db);
  }

  async getConsentsForUser(params: {
    userId: string;
    subject: string;
    organisationId?: string;
    pagination: Required<PaginationParams>;
  }): Promise<{ data: ConsentWithStatement[]; totalCount: number }> {
    const totalCount = await this.model.countConsentsForUser(
      params.userId,
      params.subject,
      params.organisationId,
    );

    if (totalCount === 0) {
      return { data: [], totalCount: 0 };
    }

    const rows = await this.model.listConsentsForUser({
      userId: params.userId,
      subject: params.subject,
      organisationId: params.organisationId,
      pagination: params.pagination,
    });

    return { data: rows.map(toConsentWithStatement), totalCount };
  }

  async getLatestConsentForUser(
    userId: string,
    subjects: ConsentSubject[],
  ): Promise<Consent[]> {
    return this.model.getLatestConsentForUserRows(userId, subjects);
  }

  async getLatestConsentForUsers(params: {
    subject: string;
    organisationId: string;
    pagination: Required<PaginationParams>;
  }): Promise<{ data: ConsentWithStatement[]; totalCount: number }> {
    const totalCount = await this.model.countLatestConsentsForUsers(
      params.subject,
      params.organisationId,
    );

    if (totalCount === 0) {
      return { data: [], totalCount: 0 };
    }

    const rows = await this.model.listLatestConsentsForUsers({
      subject: params.subject,
      organisationId: params.organisationId,
      pagination: params.pagination,
    });

    return { data: rows.map(toConsentWithStatement), totalCount };
  }
}

/**
 * Build a {@link ConsentService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers (and tests) that still pass a pool;
 * route handlers construct the service from `app.db` directly.
 */
export const consentServiceFromPool = (pool: Pool): ConsentService =>
  new ConsentService(createDbFromPool<DB>(pool));
