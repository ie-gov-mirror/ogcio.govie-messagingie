import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Permissions } from "~/const/permissions.js";
import {
  SupportCreateAnnouncementSchema,
  SupportGetAnnouncementSchema,
  SupportListAnnouncementsSchema,
  SupportSetAnnouncementEnabledSchema,
} from "~/schemas/announcements/support.js";
import type {
  FastifyReplyTypebox,
  FastifyRequestTypebox,
} from "~/schemas/shared.js";
import { AnnouncementService } from "~/services/announcements/announcement-service.js";
import {
  createAnnouncement,
  setAnnouncementEnabled,
} from "~/services/announcements/announcements-service.js";
import { parseBooleanEnum } from "~/types/typebox.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";
import { ensureValidSupportUser } from "~/utils/support-routes.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  fastify.post(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.Platform.Write]),
      schema: SupportCreateAnnouncementSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof SupportCreateAnnouncementSchema>,
      reply: FastifyReplyTypebox<typeof SupportCreateAnnouncementSchema>,
    ) => {
      const error = ensureValidSupportUser(request, reply);
      if (error) {
        return error;
      }

      const result = await createAnnouncement({
        pool: fastify.pg.pool,
        announcement: {
          ...request.body,
          isEnabled: parseBooleanEnum(request.body.isEnabled),
        },
        logger: request.log,
        loggedInUserId: request.userData?.userId ?? null,
      });

      return reply.send({ data: result });
    },
  );

  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.Platform.Read]),
      schema: SupportListAnnouncementsSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof SupportListAnnouncementsSchema>,
      reply: FastifyReplyTypebox<typeof SupportListAnnouncementsSchema>,
    ) => {
      const error = ensureValidSupportUser(request, reply);
      if (error) {
        return error;
      }

      const output = await new AnnouncementService(fastify.db).list({
        applicationId: request.query.applicationId,
        isEnabled:
          request.query.isEnabled !== undefined
            ? parseBooleanEnum(request.query.isEnabled)
            : undefined,
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

  fastify.get(
    "/:id",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.Platform.Read]),
      schema: SupportGetAnnouncementSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof SupportGetAnnouncementSchema>,
      reply: FastifyReplyTypebox<typeof SupportGetAnnouncementSchema>,
    ) => {
      const error = ensureValidSupportUser(request, reply);
      if (error) {
        return error;
      }

      return reply.send({
        data: await new AnnouncementService(fastify.db).getById(
          request.params.id,
        ),
      });
    },
  );

  fastify.patch(
    "/:id",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.Platform.Write]),
      schema: SupportSetAnnouncementEnabledSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof SupportSetAnnouncementEnabledSchema
      >,
      reply: FastifyReplyTypebox<typeof SupportSetAnnouncementEnabledSchema>,
    ) => {
      const error = ensureValidSupportUser(request, reply);
      if (error) {
        return error;
      }

      return reply.send({
        data: await setAnnouncementEnabled({
          pool: fastify.pg.pool,
          id: request.params.id,
          announcement: {
            isEnabled: parseBooleanEnum(request.body.isEnabled),
          },
          logger: request.log,
        }),
      });
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/support/announcements";
