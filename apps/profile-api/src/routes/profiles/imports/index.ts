import { httpErrors } from "@fastify/sensible";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Permissions } from "~/const/permissions.js";
import { GetProfileImportDetailsSchema } from "~/schemas/profiles/get-import.js";
import { GetProfileTemplateSchema } from "~/schemas/profiles/get-template.js";
import { ImportProfilesSchema } from "~/schemas/profiles/import-profiles.js";
import { ListProfileImportsSchema } from "~/schemas/profiles/list-imports.js";
import type {
  FastifyReplyTypebox,
  FastifyRequestTypebox,
} from "~/schemas/shared.js";
import { getProfileTemplate } from "~/services/profiles/get-profile-template.js";
import { ProfileImportService } from "~/services/profiles/imports/profile-import-service.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";
import { withOrganizationId } from "~/utils/with-organization-id.js";
import { importProfilesRoute } from "../shared.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  const { config } = fastify;

  fastify.post(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Write,
          Permissions.UserAdmin.Write,
        ]),
      schema: ImportProfilesSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof ImportProfilesSchema>,
      reply: FastifyReplyTypebox<typeof ImportProfilesSchema>,
    ) => {
      return importProfilesRoute(request, reply, fastify);
    },
  );

  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: ListProfileImportsSchema,
    },
    async (request: FastifyRequestTypebox<typeof ListProfileImportsSchema>) => {
      const { data, total: totalCount } = await new ProfileImportService(
        fastify.db,
      ).list({
        organisationId: withOrganizationId(request),
        pagination: sanitizePagination(request.query),
        search: request.query.search,
        source: request.query.source ?? "csv",
      });

      return formatAPIResponse({
        data,
        config,
        request,
        totalCount,
      });
    },
  );

  fastify.get(
    "/:importId",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: GetProfileImportDetailsSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof GetProfileImportDetailsSchema>,
    ) => {
      const organisationId = withOrganizationId(request);
      const importService = new ProfileImportService(fastify.db);
      const importData = await importService.get(request.params.importId);
      if (importData.organisationId !== organisationId) {
        throw httpErrors.notFound(
          `Status for profile_import with id ${request.params.importId} not found`,
        );
      }
      const importDetailsData = await importService.getDetails(
        request.params.importId,
      );

      return {
        data: {
          ...importData,
          details: importDetailsData,
        },
      };
    },
  );

  fastify.get(
    "/template",
    {
      schema: GetProfileTemplateSchema,
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Write,
          Permissions.UserAdmin.Write,
        ]),
    },
    async (_, reply) => {
      const csvBuffer = getProfileTemplate();
      return reply
        .header("Content-Type", "text/csv")
        .header(
          "Content-Disposition",
          'attachment; filename="profile-template.csv"',
        )
        .send(csvBuffer);
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/profiles/imports";
