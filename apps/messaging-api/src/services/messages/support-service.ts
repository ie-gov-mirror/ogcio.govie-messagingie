import { httpErrors } from "@fastify/sensible";
import { createDbFromPool, type Kysely } from "@ogcio/db-core";
import { getErrorMessage } from "@ogcio/shared-errors";
import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import type { DB } from "../../db/schema.js";
import { SupportMessageModel } from "../../models/support-message-model.js";
import type {
  SupportBodyParams,
  SupportMessageList,
} from "../../types/messages-support.js";
import type { PaginationParams } from "../../types/schemaDefinitions.js";

/**
 * Business logic for the support-messages read endpoint. Composes
 * {@link SupportMessageModel} for data access and keeps the error logging /
 * mapping here, so route handlers stay thin controllers.
 */
export class SupportMessageService {
  private readonly model: SupportMessageModel;

  constructor(
    db: Kysely<DB>,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.model = new SupportMessageModel(db);
  }

  async list(params: {
    pagination: Required<PaginationParams>;
    requestParams: SupportBodyParams;
    deletedAfterDateTime?: string;
  }): Promise<{ data: SupportMessageList; totalCount: number }> {
    try {
      return await this.model.listForRecipients({
        recipientUserIds: params.requestParams.recipientUserIds,
        pagination: params.pagination,
        deletedAfterDateTime: params.deletedAfterDateTime,
      });
    } catch (error) {
      this.logger.error(
        { error: getErrorMessage(error) },
        "Error retrieving messages for support list",
      );
      throw httpErrors.createError(
        500,
        "Failed retrieving messages for support list",
        {
          parent: error,
        },
      );
    }
  }
}

export async function supportListMessages(params: {
  pagination: Required<PaginationParams>;
  requestParams: SupportBodyParams;
  logger: FastifyBaseLogger;
  pool: Pool;
  deletedAfterDateTime?: string;
}): Promise<{ data: SupportMessageList; totalCount: number }> {
  return new SupportMessageService(
    createDbFromPool<DB>(params.pool),
    params.logger,
  ).list({
    pagination: params.pagination,
    requestParams: params.requestParams,
    deletedAfterDateTime: params.deletedAfterDateTime,
  });
}
