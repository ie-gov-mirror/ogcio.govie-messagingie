import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "~/db/schema.js";
import {
  ConsentStatementModel,
  type ListConsentStatementsParams,
} from "~/models/consent-statement-model.js";
import type {
  ConsentStatement,
  ConsentStatementLanguage,
  ConsentStatementTranslation,
  ConsentStatementWithTranslations,
} from "~/schemas/consent-statements/shared.js";
import {
  type ConsentSubject,
  ConsentSubjects,
} from "~/schemas/consents/shared.js";

/**
 * Business logic for the `consent_statements` read paths. Composes
 * {@link ConsentStatementModel} and keeps the not-found handling and response
 * shaping here so route handlers stay thin.
 *
 * Only the non-transactional reads served on a pool route here; the
 * transactional `{ client }` variants and the write paths remain on raw pg in
 * `consent-statements-service.ts`.
 */
export class ConsentStatementService {
  private readonly model: ConsentStatementModel;

  constructor(db: Kysely<DB>) {
    this.model = new ConsentStatementModel(db);
  }

  async getById(id: string): Promise<ConsentStatementWithTranslations> {
    const statement = await this.model.getStatementByIdRow(id);
    if (!statement) {
      throw httpErrors.notFound("No consent statement found for this subject");
    }

    return this.withTranslations(statement);
  }

  async getCurrent(subject: string): Promise<ConsentStatementWithTranslations> {
    const statement = await this.model.getCurrentStatementRow(subject);
    if (!statement) {
      throw httpErrors.notFound("No consent statement found for this subject");
    }

    return this.withTranslations(statement);
  }

  async getCurrentMany(
    subjects: string[],
  ): Promise<ConsentStatementWithTranslations[]> {
    if (subjects.length === 0) {
      return [];
    }

    const statements =
      await this.model.getCurrentStatementsForSubjects(subjects);
    if (statements.length === 0) {
      return [];
    }

    const translationRows = await this.model.getTranslationsForStatements(
      statements.map((statement) => statement.id),
    );

    if (translationRows.length === 0) {
      throw httpErrors.notFound(
        "No translations found for these consent statement",
      );
    }

    const translations = translationRows.reduce<
      Record<
        string,
        Record<ConsentStatementLanguage, ConsentStatementTranslation>
      >
    >(
      (acc, translation) => {
        if (!acc[translation.consentStatementId]) {
          acc[translation.consentStatementId] = {} as Record<
            ConsentStatementLanguage,
            ConsentStatementTranslation
          >;
        }
        acc[translation.consentStatementId][translation.language] = translation;
        return acc;
      },
      {} as Record<
        string,
        Record<ConsentStatementLanguage, ConsentStatementTranslation>
      >,
    );

    return statements.map((statement) => {
      const currentTranslations = translations[statement.id] || {};
      return {
        ...statement,
        version: Number(statement.version),
        translations: currentTranslations,
      };
    });
  }

  async list(
    params: ListConsentStatementsParams,
  ): Promise<{ data: ConsentStatement[]; totalCount: number }> {
    return this.model.listStatements(params);
  }

  async getAvailableSubjects(): Promise<ConsentSubject[]> {
    const output = await this.model.getAvailableSubjects();

    const validConsentSubjects = Object.values(
      ConsentSubjects as Record<string, string>,
    );

    return output.filter((subject) => validConsentSubjects.includes(subject));
  }

  private async withTranslations(
    statement: ConsentStatement,
  ): Promise<ConsentStatementWithTranslations> {
    const translationRows = await this.model.getTranslationsForStatement(
      statement.id,
    );

    if (translationRows.length === 0) {
      throw httpErrors.notFound(
        "No translations found for this consent statement",
      );
    }

    const translations = translationRows.reduce<
      Record<ConsentStatementLanguage, ConsentStatementTranslation>
    >(
      (acc, translation) => {
        acc[translation.language] = translation;
        return acc;
      },
      {} as Record<ConsentStatementLanguage, ConsentStatementTranslation>,
    );

    return {
      ...statement,
      version: Number(statement.version),
      translations,
    };
  }
}

/**
 * Build a {@link ConsentStatementService} from a raw pg {@link Pool}. Used by
 * the backward-compatible function wrappers (and tests) that still pass a pool;
 * route handlers construct the service from `app.db` directly.
 */
export const consentStatementServiceFromPool = (
  pool: Pool,
): ConsentStatementService =>
  new ConsentStatementService(createDbFromPool<DB>(pool));
