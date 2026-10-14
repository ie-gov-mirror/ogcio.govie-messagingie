import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Permissions } from "~/const/permissions.js";
import {
  CitizenLatestConsentSchema,
  CitizenListConsentsSchema,
  CitizenSubmitConsentsSchema,
} from "~/schemas/consents/citizen.js";
import type {
  FastifyReplyTypebox,
  FastifyRequestTypebox,
} from "~/schemas/shared.js";
import { ConsentService } from "~/services/consents/consent-service.js";
import {
  getLatestConsentForUser,
  submitConsents,
} from "~/services/consents/consents-service.js";
import { ensureUserIdIsSet } from "~/utils/authentication-factory.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Read]),
      schema: CitizenListConsentsSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof CitizenListConsentsSchema>,
    ) => {
      const userId = ensureUserIdIsSet(request);
      const paginationParams = sanitizePagination({
        limit: request.query.limit,
        offset: request.query.offset,
      });
      const consents = await new ConsentService(fastify.db).getConsentsForUser({
        userId,
        subject: request.query.subject,
        pagination: paginationParams,
      });

      return formatAPIResponse({
        data: consents.data,
        totalCount: consents.totalCount,
        config: fastify.config,
        request,
      });
    },
  );

  fastify.get(
    "/latest",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Read]),
      schema: CitizenLatestConsentSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof CitizenLatestConsentSchema>,
    ) => {
      const userId = ensureUserIdIsSet(request);
      return {
        data: await getLatestConsentForUser({
          pool: fastify.pg.pool,
          userId,
          subject: request.query.subject,
        }),
      };
    },
  );

  fastify.post(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Write]),
      schema: CitizenSubmitConsentsSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof CitizenSubmitConsentsSchema>,
      reply: FastifyReplyTypebox<typeof CitizenSubmitConsentsSchema>,
    ) => {
      const userId = ensureUserIdIsSet(request);

      try {
        const result = await submitConsents({
          pool: fastify.pg.pool,
          userId,
          consentInput: request.body,
          logger: request.log,
        });

        // Check if there are validation errors
        if (result.errors && result.errors.length > 0) {
          request.log.warn(
            { errors: result.errors },
            "[Consent] - Validation errors when submitting consents",
          );
          reply.statusCode = 400;
          return { errors: result.errors };
        }

        reply.statusCode = 201;
        return { data: result.data };
      } catch (error) {
        // Handle HTTP errors thrown by the service
        if (error && typeof error === "object" && "statusCode" in error) {
          const httpError = error as { statusCode: number; message: string };
          request.log.warn(
            { httpError },
            "[Consent] - Error catched submitting consents - HTTP",
          );
          if (httpError.statusCode === 400) {
            reply.statusCode = 400;
            return {
              errors: [
                {
                  subject: "general",
                  consentStatementId: "00000000-0000-0000-0000-000000000000", // Use a placeholder UUID
                  errors: [httpError.message],
                },
              ],
            };
          }
        } else {
          request.log.warn(
            { error },
            "[Consent] - Error catched submitting consents - Non-HTTP",
          );
        }
        // Re-throw other errors
        throw error;
      }
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/citizens/consents";
