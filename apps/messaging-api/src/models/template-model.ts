import { BaseModel, type Kysely, sql } from "@ogcio/db-core";
import type { DB } from "../db/schema.js";
import type {
  AvailableLanguages,
  PaginationParams,
} from "../types/schemaDefinitions.js";
import type { CreateTemplateReqBody } from "../types/templates.js";

export interface ListTemplateRow {
  templateMetaId: string;
  contents: { language: AvailableLanguages; templateName: string }[];
  count: number;
}

export interface TemplateContentRow {
  templateName: string;
  subject: string;
  excerpt: string | null;
  plainText: string;
  richText: string | null;
  language: string;
  fieldName?: string;
}

/**
 * Data-access model for the message-template domain (spanning
 * `message_template_meta`, `message_template_contents` and
 * `message_template_variables`). Extends {@link BaseModel} for generic CRUD and
 * ports the multi-table reads/writes previously living in `template-service.ts`.
 *
 * The list query uses a CTE plus correlated `jsonb_agg` subqueries the query
 * builder cannot express cleanly, so it (and the other multi-table statements)
 * drop to the exported `sql` template, kept identical to the previous raw-pg
 * implementation. `count` is still a string from pg; TemplateService coerces it.
 */
export class TemplateModel extends BaseModel<DB, "messageTemplateMeta"> {
  constructor(db: Kysely<DB>) {
    super(db, "messageTemplateMeta");
  }

  /** Paginated template list rows for an organisation, optional name search. */
  async listRows(params: {
    organizationId: string;
    pagination: Required<PaginationParams>;
    search?: string;
  }): Promise<ListTemplateRow[]> {
    const searchFilter = params.search
      ? sql`AND c.template_name ilike ${`%${params.search}%`}`
      : sql``;

    const { rows } = await sql<ListTemplateRow>`
    WITH meta_count as(
      select count(distinct(m.id)) FROM message_template_meta m
      join message_template_contents c on c.template_meta_id = m.id
      WHERE 
        organisation_id = ${params.organizationId} 
        AND deleted_at is null
        ${searchFilter}
    )
    SELECT  
      m.id as "templateMetaId",
      (
        SELECT jsonb_agg(jsonb_build_object('templateName', template_name, 'language', c.lang)) 
          FROM message_template_contents c 
          WHERE template_meta_id = id
      ) as "contents",
      (SELECT count from meta_count) as "count",
      (SELECT created_at FROM message_template_contents c WHERE c.template_meta_id = id LIMIT 1)
    FROM message_template_meta m
    join message_template_contents c on c.template_meta_id = m.id
    WHERE
      organisation_id = ${params.organizationId} AND
      m.deleted_at is null
      ${searchFilter}
    GROUP BY "templateMetaId"
    ORDER BY created_at DESC
    LIMIT ${params.pagination.limit}
    OFFSET ${params.pagination.offset}
  `.execute(this.db);

    return rows;
  }

  /** Joined meta/contents/variables rows for a single (non-deleted) template. */
  async findTemplateRows(
    templateId: string,
    organizationId: string,
  ): Promise<TemplateContentRow[]> {
    const { rows } = await sql<TemplateContentRow>`
        SELECT
            template_name as "templateName",
            subject,
            excerpt,
            plain_text as "plainText",
            rich_text as "richText",
            lang as "language",
            v.field_name as "fieldName"
        FROM message_template_meta m
        JOIN message_template_contents c on c.template_meta_id = m.id
        LEFT JOIN message_template_variables v on v.template_meta_id = m.id
        WHERE m.id = ${templateId} AND m.organisation_id = ${organizationId} AND m.deleted_at is null;
    `.execute(this.db);

    return rows;
  }

  /** Whether any of the given (name, language) pairs already exist for the org. */
  async templateNameExists(params: {
    organizationId: string;
    contents: { templateName: string; language: string }[];
    templateIdToIgnore?: string;
  }): Promise<boolean> {
    const orClauses = params.contents.map(
      ({ templateName, language }) =>
        sql`(lower(template_name) = lower(${templateName}) AND lang=${language})`,
    );
    const orFilter = sql.join(orClauses, sql` OR `);
    const ignoreFilter = params.templateIdToIgnore
      ? sql` AND m.id != ${params.templateIdToIgnore} `
      : sql``;

    const { rows } = await sql<{ exists: boolean }>`
        SELECT exists(SELECT 1 FROM message_template_meta m 
          JOIN message_template_contents c on c.template_meta_id = m.id
          WHERE organisation_id = ${params.organizationId} ${ignoreFilter}
          AND (${orFilter})
          LIMIT 1
        );
    `.execute(this.db);

    return Boolean(rows.at(0)?.exists);
  }

  /** Create a template meta row plus its contents/variables in one transaction. */
  async createTemplate(params: {
    userId: string;
    organizationId: string;
    inputBody: CreateTemplateReqBody;
  }): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const { rows } = await sql<{ id: string }>`
        INSERT INTO message_template_meta(organisation_id, created_by_user_id)
        VALUES(${params.organizationId}, ${params.userId})
        returning id
    `.execute(trx);

      const templateMetaId = rows.at(0)?.id;
      if (!templateMetaId) {
        throw new Error("failed to create a template meta");
      }

      await this.insertContentAndVariables(
        trx,
        templateMetaId,
        params.inputBody,
      );

      return templateMetaId;
    });
  }

  /** Replace all contents/variables of an existing template in one transaction. */
  async replaceTemplateContents(params: {
    templateId: string;
    inputBody: CreateTemplateReqBody;
  }): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`
          DELETE from message_template_contents
          WHERE template_meta_id = ${params.templateId}
      `.execute(trx);
      // Flush all variables and re-insert. Easier than figuring out which has been modified, added or removed
      await sql`
              DELETE from message_template_variables
              WHERE template_meta_id = ${params.templateId}
          `.execute(trx);
      await this.insertContentAndVariables(
        trx,
        params.templateId,
        params.inputBody,
      );
    });
  }

  /** Soft-delete a template: rename its contents and stamp `deleted_at`. */
  async softDeleteTemplate(params: {
    templateId: string;
    organizationId: string;
    contents: { language: string; templateName: string }[];
  }): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const updatePromises: Promise<unknown>[] = [];
      for (const content of params.contents) {
        const updatedName = `${content.templateName}-deleted-${Date.now()}`;
        updatePromises.push(
          sql`
            UPDATE message_template_contents
            SET template_name = ${updatedName}
            WHERE template_meta_id = ${params.templateId} AND lang = ${content.language}
        `.execute(trx),
        );
      }
      await Promise.all(updatePromises);

      await sql`
        UPDATE message_template_meta
        SET deleted_at=now()
        WHERE id = ${params.templateId} AND organisation_id = ${params.organizationId};
    `.execute(trx);
    });
  }

  private async insertContentAndVariables(
    trx: Kysely<DB>,
    templateMetaId: string,
    inputBody: CreateTemplateReqBody,
  ): Promise<void> {
    const { contents, variables } = inputBody;

    for (const content of contents) {
      const {
        excerpt,
        language: lang,
        templateName,
        plainText,
        richText,
        subject,
      } = content;
      await sql`
            INSERT INTO message_template_contents(
              template_meta_id, 
              template_name,
              lang,
              subject,
              excerpt,
              rich_text,
              plain_text
              )
            VALUES (
              ${templateMetaId}, ${templateName}, ${lang}, ${subject}, ${excerpt ?? null}, ${richText ?? null}, ${plainText}
            )
          `.execute(trx);
    }

    for (const field of variables || []) {
      await sql`
            INSERT INTO message_template_variables(template_meta_id, field_name)
            VALUES(${templateMetaId}, ${field.name})
          `.execute(trx);
    }
  }
}
