import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { ScheduledEventService } from "../../services/tasks/scheduled-event-service.js";
import { HttpError } from "../../types/httpErrors.js";
import { Permissions } from "../../types/permissions.js";

type RequestBody = {
  executeAt: string;
  webhookUrl: string;
  webhookAuth: string;
}[];

export default async function tasks(app: FastifyInstance) {
  app.post<{ Body: RequestBody }>(
    "/",
    {
      preValidation: (req, res) =>
        app.checkPermissions(req, res, [Permissions.Scheduler.Write]),

      schema: {
        body: Type.Array(
          Type.Object({
            webhookUrl: Type.String({ format: "uri" }),
            webhookAuth: Type.String(),
            executeAt: Type.String({ format: "date-time" }),
          }),
        ),
        tags: ["Tasks"],
        response: {
          202: Type.Null(),
          500: HttpError,
        },
      },
    },
    async function handleScheduleTasks(request, reply) {
      try {
        await new ScheduledEventService(app.db).scheduleTasks(request.body);
      } catch (err) {
        throw app.httpErrors.createError(500, "failed to parse request", {
          parent: err,
        });
      }

      reply.status(202);
    },
  );
}
