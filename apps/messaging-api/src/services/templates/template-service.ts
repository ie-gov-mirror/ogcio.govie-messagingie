import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import { TemplateModel } from "../../models/template-model.js";
import type { PaginationParams } from "../../types/schemaDefinitions.js";
import type {
  CreateTemplateReqBody,
  GetTemplateResponseItem,
  ListTemplatesResponseItem,
  UpdateTemplateReqBody,
} from "../../types/templates.js";

type ListTemplatesResponse = {
  data: ListTemplatesResponseItem[];
  totalCount: number;
};

/**
 * Business logic for the message-template domain. Composes {@link TemplateModel}
 * for data access and keeps the response shaping (contents/fields aggregation),
 * uniqueness enforcement and error mapping here, so route handlers stay thin
 * controllers.
 */
export class TemplateService {
  private readonly model: TemplateModel;

  constructor(db: Kysely<DB>) {
    this.model = new TemplateModel(db);
  }

  async list(params: {
    pagination: Required<PaginationParams>;
    search?: string;
    organizationId: string;
  }): Promise<ListTemplatesResponse> {
    const rows = await this.model.listRows({
      organizationId: params.organizationId,
      pagination: params.pagination,
      search: params.search,
    });

    const data: ListTemplatesResponseItem[] = [];
    for (const row of rows) {
      data.push({ id: row.templateMetaId, contents: row.contents });
    }

    // pg returns `count` as a string; coerce so pagination metadata stays numeric.
    const totalCount = Number(rows.at(0)?.count ?? 0);

    return { data, totalCount };
  }

  async get(params: {
    templateId: string;
    organizationId: string;
  }): Promise<GetTemplateResponseItem> {
    const rows = await this.model.findTemplateRows(
      params.templateId,
      params.organizationId,
    );

    const outputTemplate: GetTemplateResponseItem = {
      contents: [],
      fields: [],
    };

    for (const row of rows) {
      const {
        excerpt,
        plainText,
        richText,
        subject,
        templateName,
        fieldName,
        language,
      } = row;

      const content = outputTemplate.contents?.find(
        (content) => content.language === language,
      );

      // if already exists, update it
      if (content) {
        content.excerpt = excerpt ?? undefined;
        content.plainText = plainText;
        content.richText = richText ?? undefined;
        content.subject = subject;
        content.templateName = templateName;
      } else {
        outputTemplate.contents.push({
          excerpt: excerpt ?? undefined,
          language,
          plainText,
          richText: richText ?? undefined,
          subject,
          templateName,
        });
      }

      if (
        fieldName &&
        !outputTemplate.fields.some((field) => field.fieldName === fieldName)
      ) {
        outputTemplate.fields.push({ fieldName });
      }
    }

    if (!outputTemplate.contents.length) {
      throw httpErrors.notFound("no template found");
    }

    return outputTemplate;
  }

  async create(params: {
    inputBody: CreateTemplateReqBody;
    userId: string;
    organizationId: string;
  }): Promise<string> {
    await this.ensureTemplateNameDoesntExist({
      inputBody: params.inputBody,
      organizationId: params.organizationId,
    });

    try {
      return await this.model.createTemplate({
        userId: params.userId,
        organizationId: params.organizationId,
        inputBody: params.inputBody,
      });
    } catch (err) {
      throw httpErrors.createError(500, "failed to create template", {
        parent: err,
      });
    }
  }

  async update(params: {
    inputBody: UpdateTemplateReqBody;
    templateId: string;
    organizationId: string;
  }): Promise<void> {
    // adding this will return 404 if template does not exist
    await this.get({
      templateId: params.templateId,
      organizationId: params.organizationId,
    });

    await this.ensureTemplateNameDoesntExist({
      organizationId: params.organizationId,
      templateIdToIgnore: params.templateId,
      inputBody: params.inputBody,
    });

    try {
      await this.model.replaceTemplateContents({
        templateId: params.templateId,
        inputBody: params.inputBody,
      });
    } catch (error) {
      throw httpErrors.createError(500, "failed to update template", {
        parent: error,
      });
    }
  }

  async delete(params: {
    organizationId: string;
    templateId: string;
  }): Promise<void> {
    const template = await this.get(params);

    await this.model.softDeleteTemplate({
      templateId: params.templateId,
      organizationId: params.organizationId,
      contents: template.contents.map((content) => ({
        language: content.language,
        templateName: content.templateName,
      })),
    });
  }

  private async ensureTemplateNameDoesntExist(params: {
    inputBody: CreateTemplateReqBody;
    organizationId: string;
    templateIdToIgnore?: string;
  }): Promise<void> {
    const exists = await this.model.templateNameExists({
      organizationId: params.organizationId,
      contents: params.inputBody.contents.map((content) => ({
        templateName: content.templateName,
        language: content.language,
      })),
      templateIdToIgnore: params.templateIdToIgnore,
    });

    if (exists) {
      throw httpErrors.createError(422, "Template name already exists", {
        validation: [
          {
            fieldName: "templateName",
            message: "alreadyInUse",
            validationRule: "already-in-use",
          },
        ],
      });
    }
  }
}

/**
 * Build a {@link TemplateService} from a raw pg {@link Pool}. Used by the
 * backward-compatible function wrappers below (and by tests) that still pass a
 * pool; route handlers instead construct the service from `app.db` directly.
 */
const serviceFromPool = (pool: Pool): TemplateService =>
  new TemplateService(createDbFromPool<DB>(pool));

export async function listTemplates(params: {
  pool: Pool;
  pagination: Required<PaginationParams>;
  search?: string;
  organizationId: string;
}): Promise<ListTemplatesResponse> {
  return serviceFromPool(params.pool).list({
    pagination: params.pagination,
    search: params.search,
    organizationId: params.organizationId,
  });
}

export async function getTemplate(params: {
  pool: Pool;
  templateId: string;
  organizationId: string;
}): Promise<GetTemplateResponseItem> {
  return serviceFromPool(params.pool).get({
    templateId: params.templateId,
    organizationId: params.organizationId,
  });
}

export async function createTemplate(params: {
  pool: Pool;
  inputBody: CreateTemplateReqBody;
  userId: string;
  organizationId: string;
}): Promise<string> {
  return serviceFromPool(params.pool).create({
    inputBody: params.inputBody,
    userId: params.userId,
    organizationId: params.organizationId,
  });
}

export async function updateTemplate(params: {
  pool: Pool;
  inputBody: UpdateTemplateReqBody;
  templateId: string;
  organizationId: string;
}): Promise<void> {
  return serviceFromPool(params.pool).update({
    inputBody: params.inputBody,
    templateId: params.templateId,
    organizationId: params.organizationId,
  });
}

export async function deleteTemplate(params: {
  organizationId: string;
  templateId: string;
  pool: Pool;
}): Promise<void> {
  return serviceFromPool(params.pool).delete({
    organizationId: params.organizationId,
    templateId: params.templateId,
  });
}
