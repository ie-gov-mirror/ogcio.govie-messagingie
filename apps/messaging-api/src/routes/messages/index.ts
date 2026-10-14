import { httpErrors } from "@fastify/sensible";
import { ensureUserCanAccessUser } from "@ogcio/api-auth";
import type { FastifyInstance } from "fastify";
import { getEventsForMessageId } from "../../services/message-events/message-event-service.js";
import {
  MessageService,
  processMessage,
} from "../../services/messages/message-service.js";
import {
  type CreateMessageBody,
  CreateMessageReqSchema,
  DeleteMessagesReqSchema,
  type GenericIdResponse,
  GetEventsForMessageReqSchema,
  type GetMessageParams,
  type GetMessageQuerystring,
  GetMessageReqSchema,
  type GetMessageResponse,
  type ListMessageResponse,
  ListMessagesReqGetSchema,
  type ListMessagesReqParams,
  ListMessagesReqPostSchema,
} from "../../types/messages.js";
import { Permissions } from "../../types/permissions.js";
import { parseBooleanEnum } from "../../types/schemaDefinitions.js";
import type {
  FastifyReplyTypebox,
  FastifyRequestTypebox,
} from "../../types/shared.js";
import { AssignTagReqSchema } from "../../types/tags.js";
import { getM2MAnalyticsSdk } from "../../utils/authentication-factory.js";
import {
  formatAPIResponse,
  sanitizePagination,
} from "../../utils/pagination.js";

export const prefix = "/messages";

export default async function messages(app: FastifyInstance) {
  // All messages
  app.get<{
    Response: ListMessageResponse;
    Querystring: ListMessagesReqParams;
  }>(
    "/",
    {
      preValidation: async (req, res) =>
        app.checkPermissions(
          req,
          res,
          [Permissions.MessageSelf.Read, Permissions.OnboardedCitizen],
          { method: "AND" },
        ),
      schema: ListMessagesReqGetSchema,
    },
    async function getMessagesHandler(request, _reply) {
      const userData = request.ensureUserIsSet();
      const loggedInUserId = userData.userId;
      const loggedInOrgId = userData.organizationId;
      const queryRecipientUserId = request.query.recipientUserId;
      const queryOrganisationId = request.query.organisationId;
      const pagination = sanitizePagination({
        limit: request.query.limit,
        offset: request.query.offset,
      });

      const messages = await new MessageService(app.db, request.log).list({
        loggedInUserData: {
          userId: loggedInUserId,
          organizationId: loggedInOrgId,
          accessToken: userData.accessToken,
        },
        query: {
          recipientUserId: queryRecipientUserId,
          organisationId: queryOrganisationId,
          isSeen: request.query.isSeen,
          search: request.query.search,
          messagesStatus: request.query.status,
          deletedAfterDateTime: request.query.deletedAfterDateTime,
          tagId: request.query.tagId,
          untagged:
            request.query.untagged !== undefined
              ? parseBooleanEnum(request.query.untagged)
              : undefined,
        },
        pagination,
      });

      return formatAPIResponse({
        data: messages.data,
        request,
        totalCount: messages.totalCount,
      });
    },
  );

  app.post<{
    Body: ListMessagesReqParams;
    Response: ListMessageResponse;
  }>(
    "/search",
    {
      preValidation: (req, res) =>
        app.checkPermissions(
          req,
          res,
          [Permissions.MessageSelf.Read, Permissions.OnboardedCitizen],
          { method: "AND" },
        ),
      schema: ListMessagesReqPostSchema,
    },
    async function postMessagesHandler(request) {
      const userData = request.ensureUserIsSet();
      const organizationId = userData.organizationId;

      const pagination = sanitizePagination({
        limit: request.body.limit,
        offset: request.body.offset,
      });

      const messages = await new MessageService(app.db, request.log).list({
        loggedInUserData: { ...userData, organizationId },
        query: {
          recipientUserId: request.body.recipientUserId,
          organisationId: request.body.organisationId,
          isSeen: request.body.isSeen,
          search: request.body.search,
          messagesStatus: request.body.status,
          deletedAfterDateTime: request.body.deletedAfterDateTime,
          tagId: request.body.tagId,
          untagged:
            request.body.untagged !== undefined
              ? parseBooleanEnum(request.body.untagged)
              : undefined,
        },
        pagination,
      });

      return formatAPIResponse({
        data: messages.data,
        request,
        totalCount: messages.totalCount,
      });
    },
  );

  // Message by id
  app.get<{
    Params: GetMessageParams;
    Querystring: GetMessageQuerystring;
    Response: GetMessageResponse;
  }>(
    "/:messageId",
    {
      preValidation: async (req, reply) => {
        let error: unknown;
        try {
          await app.checkPermissions(
            req,
            reply,
            [Permissions.MessageSelf.Read, Permissions.OnboardedCitizen],
            { method: "AND" },
          );
        } catch (err) {
          error = err;
        }

        if (!error) {
          return;
        }

        try {
          await app.checkPermissions(
            req,
            reply,
            [Permissions.MessageOnboarding.Read, Permissions.OnboardedCitizen],
            { method: "AND" },
          );
        } catch (err) {
          error = err;
        }

        if (!error) {
          return;
        }

        await app.checkPermissions(req, reply, [
          Permissions.MessageOnboarding.Read,
        ]);

        if (!req.userData?.isM2MApplication) {
          throw httpErrors.forbidden("Cannot access get message api");
        }
      },
      schema: GetMessageReqSchema,
    },
    async function getMessageHandler(request, _reply) {
      const userData = request.ensureUserIsSet();
      const hasOnboardingPermission = userData.scopes.includes(
        Permissions.MessageOnboarding.Read,
      );

      const loggedInUser = {
        userId: userData.userId,
        accessToken: userData.accessToken,
      };
      request.log.debug(
        {
          userId: `${loggedInUser.userId.substring(0, 4)}...`,
          hasOnboardingPermission,
        },
        "Getting message",
      );

      const gotMessage = await new MessageService(app.db, request.log).get({
        messageId: request.params.messageId,
        loggedInUser,
        hasOnboardingPermission,
        deleted:
          request.query.deleted !== undefined
            ? parseBooleanEnum(request.query.deleted)
            : undefined,
      });
      return {
        data: gotMessage,
      };
    },
  );

  app.post<{ Body: CreateMessageBody; Response: GenericIdResponse }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Message.Write]),
      schema: CreateMessageReqSchema,
    },
    async function createMessageHandler(request, reply) {
      ensureUserCanAccessUser(request.userData, request.body.recipientUserId);
      const userData = request.ensureUserIsSet();
      if (
        request.body.bypassConsent === true &&
        !userData.scopes.includes(Permissions.Consent.Override)
      ) {
        throw httpErrors.forbidden(
          "Cannot bypass recipient consent without messaging consent override scope",
        );
      }
      const organizationId = request.ensureIsPublicServant().organisationId;
      const senderUser = {
        id: userData.userId,
        organizationId,
        isM2MApplication: userData.isM2MApplication ?? false,
      };

      const message = await processMessage({
        pool: app.pg.pool,
        logger: request.log,
        message: request.body,
        sender: senderUser,
      });

      reply.statusCode = 201;
      return { data: { id: message.messageId } };
    },
  );

  app.get(
    "/:messageId/events",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Event.Read]),
      schema: GetEventsForMessageReqSchema,
    },
    async function getMessageHandler(
      request: FastifyRequestTypebox<typeof GetEventsForMessageReqSchema>,
    ) {
      const messageId = request.params.messageId;
      const organizationId = request.ensureIsPublicServant().organisationId;

      (await getM2MAnalyticsSdk(request.log)).track.event({
        event: {
          action: "Events for Message Viewed",
          category: "Event Logs",
          name: "event-view-detail",
        },
      });

      const response = await getEventsForMessageId({
        messageId,
        organizationId,
        pool: app.pg.pool,
      });

      return { data: response };
    },
  );

  app.delete(
    "/",
    {
      preValidation: (req, reply) =>
        app.checkPermissions(
          req,
          reply,
          [Permissions.MessageSelf.Write, Permissions.OnboardedCitizen],
          { method: "AND" },
        ),
      schema: DeleteMessagesReqSchema,
    },
    async function deleteMessagesHandler(
      request: FastifyRequestTypebox<typeof DeleteMessagesReqSchema>,
      reply: FastifyReplyTypebox<typeof DeleteMessagesReqSchema>,
    ) {
      const userData = request.ensureUserIsSet();

      request.ensureIsCitizen();

      const messageIds = request.body.ids;
      await new MessageService(app.db, request.log).delete({
        messageIds,
        loggedInUser: userData,
      });

      return reply.status(200).send({ data: { ids: messageIds } });
    },
  );

  // Assign or remove tag on multiple messages
  app.post(
    "/tags",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.MessageSelf.Write]),
      schema: AssignTagReqSchema,
    },
    async function handleAssignTag(
      request: FastifyRequestTypebox<typeof AssignTagReqSchema>,
      reply,
    ) {
      const userData = request.ensureUserIsSet();

      const result = await new MessageService(app.db, request.log).assignTag({
        userId: userData.userId,
        accessToken: userData.accessToken,
        messageIds: request.body.messageIds,
        tagId: request.body.tagId,
      });

      return reply.send({ data: result });
    },
  );
}
