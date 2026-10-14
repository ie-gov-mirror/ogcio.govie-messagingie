import type { FastifyInstance } from "fastify";
import { MessageActionService } from "../../services/message-actions/message-action-service.js";
import {
  type PutMessageActionBody,
  type PutMessageActionParams,
  PutMessageActionReqSchema,
  type PutMessageActionResponse,
} from "../../types/message-actions.js";
import { Permissions } from "../../types/permissions.js";

export const prefix = "/message-actions";

export default async function messagesActions(app: FastifyInstance) {
  app.put<{
    Body: PutMessageActionBody;
    Params: PutMessageActionParams;
    Response: PutMessageActionResponse;
  }>(
    "/:messageId",
    {
      preValidation: (req, res) =>
        app.checkPermissions(
          req,
          res,
          [Permissions.MessageSelf.Write, Permissions.OnboardedCitizen],
          { method: "AND" },
        ),
      schema: PutMessageActionReqSchema,
    },
    async function putMessageOptions(req) {
      const userData = req.ensureUserIsSet();

      const messageOptionId = req.params.messageId;
      if (messageOptionId !== req.body.messageId) {
        throw app.httpErrors.badRequest("url params id mismatch with body id");
      }

      await new MessageActionService(app.db, app.pg.pool, req.log).update({
        loggedInUser: {
          userId: userData.userId,
          accessToken: userData.accessToken,
        },
        body: req.body,
      });
    },
  );
}
