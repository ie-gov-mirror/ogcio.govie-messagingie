import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Permissions } from "~/const/permissions.js";
import {
  OrganisationListConsentsSchema,
  OrganisationListLatestConsentsSchema,
} from "~/schemas/consents/organisation.js";
import type { FastifyRequestTypebox } from "~/schemas/shared.js";
import {
  getConsentsForUser,
  getLatestConsentForUsers,
} from "~/services/consents/consents-service.js";
import { ensureOrganizationIdIsSet } from "~/utils/authentication-factory.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserAdmin.Read]),
      schema: OrganisationListConsentsSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof OrganisationListConsentsSchema>,
    ) => {
      const consents = await getConsentsForUser({
        userId: request.query.profileId,
        pool: fastify.pg.pool,
        paginationParams: sanitizePagination(request.query),
        subject: request.query.subject,
        organisationId: ensureOrganizationIdIsSet(request),
      });

      return formatAPIResponse({
        config: fastify.config,
        data: consents.data,
        totalCount: consents.totalCount,
        request,
      });
    },
  );

  fastify.get(
    "/latest",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: OrganisationListLatestConsentsSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationListLatestConsentsSchema
      >,
    ) => {
      const output = await getLatestConsentForUsers({
        pool: fastify.pg.pool,
        subject: request.query.subject,
        paginationParams: sanitizePagination(request.query),
        organisationId: ensureOrganizationIdIsSet(request),
      });

      return formatAPIResponse({
        config: fastify.config,
        data: output.data,
        totalCount: output.totalCount,
        request,
      });
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/organisations/consents";
