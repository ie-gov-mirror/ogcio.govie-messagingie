import type { FastifyInstance } from "fastify";
import { TagService } from "../../services/tags/tag-service.js";
import { Permissions } from "../../types/permissions.js";
import type { FastifyRequestTypebox } from "../../types/shared.js";
import {
  CreateTagReqSchema,
  DeleteTagReqSchema,
  GetTagTreeReqSchema,
  ListTagsReqSchema,
  UpdateTagReqSchema,
} from "../../types/tags.js";

export const prefix = "/tags";

export default async function tags(app: FastifyInstance) {
  // Create tag
  app.post(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [
          Permissions.MessageSelf.Write,
          Permissions.OnboardedCitizen,
        ]),
      schema: CreateTagReqSchema,
    },
    async function handleCreateTag(
      request: FastifyRequestTypebox<typeof CreateTagReqSchema>,
      reply,
    ) {
      const userData = request.ensureUserIsSet();

      const result = await new TagService(app.db).create(
        userData.userId,
        request.body,
      );

      return reply.status(201).send({ data: result });
    },
  );

  // List tags (flat)
  app.get(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(
          req,
          res,
          [Permissions.MessageSelf.Read, Permissions.OnboardedCitizen],
          { method: "AND" },
        ),
      schema: ListTagsReqSchema,
    },
    async function handleListTags(
      request: FastifyRequestTypebox<typeof ListTagsReqSchema>,
    ) {
      const userData = request.ensureUserIsSet();
      const result = await new TagService(app.db).list(userData.userId);

      return { data: result };
    },
  );

  // Tag tree — MUST be registered before /:tagId to avoid "tree" being parsed as an id
  app.get(
    "/tree",
    {
      preValidation: (req, res) =>
        app.checkPermissions(
          req,
          res,
          [Permissions.MessageSelf.Read, Permissions.OnboardedCitizen],
          { method: "AND" },
        ),
      schema: GetTagTreeReqSchema,
    },
    async function handleGetTagTree(
      request: FastifyRequestTypebox<typeof GetTagTreeReqSchema>,
    ) {
      const userData = request.ensureUserIsSet();

      const result = await new TagService(app.db).getTree(userData.userId);

      return { data: result };
    },
  );

  // Update tag
  app.patch(
    "/:tagId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [
          Permissions.MessageSelf.Write,
          Permissions.OnboardedCitizen,
        ]),
      schema: UpdateTagReqSchema,
    },
    async function handleUpdateTag(
      request: FastifyRequestTypebox<typeof UpdateTagReqSchema>,
      reply,
    ) {
      const userData = request.ensureUserIsSet();

      const result = await new TagService(app.db).update(
        userData.userId,
        request.params.tagId,
        request.body,
      );

      return reply.send({ data: result });
    },
  );

  // Delete tag
  app.delete(
    "/:tagId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [
          Permissions.MessageSelf.Write,
          Permissions.OnboardedCitizen,
        ]),
      schema: DeleteTagReqSchema,
    },
    async function handleDeleteTag(
      request: FastifyRequestTypebox<typeof DeleteTagReqSchema>,
      reply,
    ) {
      const userData = request.ensureUserIsSet();

      const result = await new TagService(app.db).delete(
        userData.userId,
        request.params.tagId,
      );

      return reply.send({ data: result });
    },
  );
}
