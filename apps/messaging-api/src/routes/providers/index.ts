import type { FastifyInstance, FastifyRequest } from "fastify";
import { EmailProviderService } from "../../services/providers/email/email-specific-provider.js";
import { Permissions } from "../../types/permissions.js";
import {
  ProviderCreateReqSchema,
  ProviderDeleteReqSchema,
  ProviderGetReqSchema,
  ProvidersListReqSchema,
  ProviderUpdateReqSchema,
} from "../../types/providers.js";
import { parseBooleanEnum } from "../../types/schemaDefinitions.js";
import type {
  FastifyReplyTypebox,
  FastifyRequestTypebox,
} from "../../types/shared.js";
import {
  formatAPIResponse,
  sanitizePagination,
} from "../../utils/pagination.js";

export const prefix = "/providers";

export default async function providers(app: FastifyInstance) {
  // get providers
  app.get(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Provider.Read]),
      schema: ProvidersListReqSchema,
    },
    async function handleGetProviders(
      request: FastifyRequestTypebox<typeof ProvidersListReqSchema>,
    ) {
      const pagination = sanitizePagination({
        limit: request.query.limit,
        offset: request.query.offset,
      });
      const isPrimary = request.query.primary
        ? parseBooleanEnum(request.query.primary)
        : undefined;

      const result = await buildEmailProvider(request).list({
        isPrimary,
        pagination,
      });

      return formatAPIResponse({
        data: result.data,
        request,
        totalCount: result.totalCount,
      });
    },
  );

  //get provider
  app.get(
    "/:providerId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Provider.Read]),
      schema: ProviderGetReqSchema,
    },
    async function handleGetProvider(
      request: FastifyRequestTypebox<typeof ProviderGetReqSchema>,
    ) {
      const provider = await buildEmailProvider(request).get({
        providerId: request.params.providerId,
        includePassword: false,
      });

      return {
        data: provider,
      };
    },
  );

  // create provider
  app.post(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Provider.Write]),
      schema: ProviderCreateReqSchema,
    },
    async function handleCreateProvider(
      request: FastifyRequestTypebox<typeof ProviderCreateReqSchema>,
      response: FastifyReplyTypebox<typeof ProviderCreateReqSchema>,
    ) {
      const providerId = await buildEmailProvider(request).create({
        inputBody: request.body,
      });

      response.status(201);
      return { data: { id: providerId } };
    },
  );

  // update provider
  app.put(
    "/:providerId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Provider.Write]),
      schema: ProviderUpdateReqSchema,
    },
    async function handleUpdateProvider(
      request: FastifyRequestTypebox<typeof ProviderUpdateReqSchema>,
    ) {
      if (request.body.id !== request.params.providerId) {
        throw app.httpErrors.badRequest(
          "provider id from body and url param are not identical",
        );
      }

      await buildEmailProvider(request).update({
        inputBody: request.body,
      });

      return { data: { id: request.params.providerId } };
    },
  );

  app.delete(
    "/:providerId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Provider.Delete]),
      schema: ProviderDeleteReqSchema,
    },
    async function handleDeleteProvider(
      request: FastifyRequestTypebox<typeof ProviderDeleteReqSchema>,
    ) {
      await buildEmailProvider(request).delete({
        providerId: request.params.providerId,
      });

      return { data: { id: request.params.providerId } };
    },
  );

  function buildEmailProvider(request: FastifyRequest): EmailProviderService {
    return new EmailProviderService(
      app.db,
      request.ensureIsPublicServant().organisationId,
      app.cryptographyService,
      undefined,
      request.log,
    );
  }
}
