import type { FastifyInstance } from "fastify";
import { TemplateService } from "../../services/templates/template-service.js";
import { Permissions } from "../../types/permissions.js";
import {
  type CreateTemplateReqBody,
  CreateTemplateReqSchema,
  DeleteTemplateReqSchema,
  type GenericIdResponse,
  GetTemplateReqSchema,
  type GetTemplateResponse,
  type ListTemplatesReqQuery,
  ListTemplatesReqSchema,
  type ListTemplatesResponse,
  type TemplateId,
  type UpdateTemplateReqBody,
  UpdateTemplateReqSchema,
} from "../../types/templates.js";
import {
  formatAPIResponse,
  sanitizePagination,
} from "../../utils/pagination.js";

export default async function templates(app: FastifyInstance) {
  app.get<{
    Response: ListTemplatesResponse;
    Querystring: ListTemplatesReqQuery;
  }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Template.Read]),
      schema: ListTemplatesReqSchema,
    },
    async function handleGetAll(request, _reply) {
      const organizationId = request.ensureIsPublicServant().organisationId;
      const pagination = sanitizePagination({
        limit: request.query.limit,
        offset: request.query.offset,
      });

      const result = await new TemplateService(app.db).list({
        pagination,
        organizationId,
        search: request.query.search,
      });

      return formatAPIResponse({
        data: result.data,
        request,
        totalCount: result.totalCount,
      });
    },
  );

  app.get<{ Params: TemplateId; Response: GetTemplateResponse }>(
    "/:templateId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Template.Read]),
      schema: GetTemplateReqSchema,
    },
    async function handleGetOne(request, _reply) {
      const organizationId = request.ensureIsPublicServant().organisationId;

      return {
        data: await new TemplateService(app.db).get({
          templateId: request.params.templateId,
          organizationId,
        }),
      };
    },
  );

  app.post<{ Body: CreateTemplateReqBody; Response: GenericIdResponse }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Template.Write]),
      schema: CreateTemplateReqSchema,
    },
    async function handleCreate(request, reply) {
      const userData = request.ensureUserIsSet();
      const userId = userData.userId;
      const organizationId = request.ensureIsPublicServant().organisationId;
      const templateId = await new TemplateService(app.db).create({
        inputBody: request.body,
        userId,
        organizationId,
      });

      reply.statusCode = 201;
      return { data: { id: templateId } };
    },
  );

  app.put<{
    Body: UpdateTemplateReqBody;
    Params: TemplateId;
    Response: GenericIdResponse;
  }>(
    "/:templateId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Template.Write]),
      schema: UpdateTemplateReqSchema,
    },
    async function handleUpdate(request, _reply) {
      const templateId = request.params.templateId;

      await new TemplateService(app.db).update({
        inputBody: request.body,
        templateId,
        organizationId: request.ensureIsPublicServant().organisationId,
      });

      return { data: { id: templateId } };
    },
  );

  app.delete<{ Params: TemplateId; Response: GenericIdResponse }>(
    "/:templateId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Template.Delete]),
      schema: DeleteTemplateReqSchema,
    },
    async function handleDelete(request, _reply) {
      const templateId = request.params.templateId;
      const organizationId = request.ensureIsPublicServant().organisationId;

      await new TemplateService(app.db).delete({ templateId, organizationId });

      return { data: { id: templateId } };
    },
  );
}
