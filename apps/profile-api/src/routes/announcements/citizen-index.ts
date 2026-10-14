import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Permissions } from "~/const/permissions.js";
import {
  CitizenAcknowledgeAnnouncementsSchema,
  CitizenListAnnouncementsSchema,
} from "~/schemas/announcements/citizen.js";
import type { FastifyRequestTypebox } from "~/schemas/shared.js";
import { AnnouncementService } from "~/services/announcements/announcement-service.js";
import { acknowledgeAnnouncements } from "~/services/announcements/announcements-service.js";
import { parseBooleanEnum } from "~/types/typebox.js";
import { ensureUserIdIsSet } from "~/utils/authentication-factory.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Read]),
      schema: CitizenListAnnouncementsSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof CitizenListAnnouncementsSchema>,
    ) => {
      const profileId = ensureUserIdIsSet(request);
      const output = await new AnnouncementService(fastify.db).listCitizen({
        profileId,
        applicationId: request.query.applicationId,
        newOnly:
          request.query.newOnly !== undefined
            ? parseBooleanEnum(request.query.newOnly)
            : false,
        pagination: sanitizePagination({ ...request.query }),
      });

      return formatAPIResponse({
        data: output.data,
        totalCount: output.totalCount,
        config: fastify.config,
        request,
      });
    },
  );

  fastify.post(
    "/acknowledgements",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Write]),
      schema: CitizenAcknowledgeAnnouncementsSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof CitizenAcknowledgeAnnouncementsSchema
      >,
      reply,
    ) => {
      const profileId = ensureUserIdIsSet(request);
      const output = await acknowledgeAnnouncements({
        pool: fastify.pg.pool,
        profileId,
        applicationId: request.body.applicationId,
        announcementIds: request.body.announcementIds,
        logger: request.log,
      });

      reply.statusCode = 201;
      return reply.send({ data: output });
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/citizens/announcements";
