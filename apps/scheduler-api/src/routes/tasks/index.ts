import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import {
  DEFAULT_CALLBACK_MAX_ITEMS,
  DEFAULT_CALLBACK_RATE_LIMIT_MAX,
  DEFAULT_CALLBACK_RATE_LIMIT_WINDOW_MS,
} from "../../config.js";
import { HttpError } from "../../types/httpErrors.js";
import { Permissions } from "../../types/permissions.js";
import { createClientRateLimiter } from "../../utils/client-rate-limit.js";

type RequestBody = {
  executeAt: string;
  webhookUrl: string;
  webhookAuth: string;
}[];

export default async function tasks(app: FastifyInstance) {
  const maxItems = app.config?.CALLBACK_MAX_ITEMS ?? DEFAULT_CALLBACK_MAX_ITEMS;
  const allowRequest = createClientRateLimiter(
    app.config?.CALLBACK_RATE_LIMIT_MAX ?? DEFAULT_CALLBACK_RATE_LIMIT_MAX,
    app.config?.CALLBACK_RATE_LIMIT_WINDOW_MS ??
      DEFAULT_CALLBACK_RATE_LIMIT_WINDOW_MS,
  );

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
          { maxItems },
        ),
        tags: ["Tasks"],
        response: {
          202: Type.Null(),
          500: HttpError,
        },
      },
    },
    async function handleScheduleTasks(request, reply) {
      const clientKey = request.userData?.userId ?? request.ip ?? "anonymous";
      if (!allowRequest(clientKey)) {
        throw app.httpErrors.tooManyRequests("rate limit exceeded");
      }

      try {
        if (request.body.length === 0) {
          reply.status(202);
          return;
        }

        const values: string[] = [];
        const args: string[] = [];
        let i = 0;
        for (const set of request.body) {
          values.push(set.webhookUrl, set.webhookAuth, set.executeAt);
          args.push(`($${++i}, $${++i}, $${++i})`);
        }
        await app.pg.pool.query(
          `
            insert into scheduled_events(
                webhook_url, webhook_auth, execute_at
            ) values ${args.join(", ")}
        `,
          values,
        );
      } catch (err) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number(err.statusCode)
            : undefined;
        if (statusCode && statusCode < 500) {
          throw err;
        }
        throw app.httpErrors.createError(500, "failed to parse request", {
          parent: err,
        });
      }

      reply.status(202);
    },
  );
}
