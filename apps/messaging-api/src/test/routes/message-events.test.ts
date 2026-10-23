import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, suite } from "vitest";
import { build } from "../test-server-builder.js";

describe("/api/v1/message-events", {}, () => {
  const getServer = async (): Promise<FastifyInstance> => {
    const server = await build();
    server.addHook("onRequest", async (req: FastifyRequest) => {
      // Override the request decorator
      server.checkPermissions = async (
        request: FastifyRequest,
        _reply: FastifyReply,
        _permissions: string[],
        _matchConfig?: { method: "AND" | "OR" },
      ) => {
        // biome-ignore lint/complexity/noUselessLoneBlockStatements: value is used as reference
        {
          req.userData = {
            userId: "userId",
            accessToken: "accessToken",
            organizationId: "organisationId",
            isM2MApplication: false,
          };

          request.userData = req.userData;
        }
      };
    });

    return server;
  };

  let app: FastifyInstance | undefined;

  afterEach(() => {
    if (app) {
      app.close();
      app = undefined;
    }
  });

  suite("list message events", async () => {
    it("should fail with illegal limit query params", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?limit=-10",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        'querystring/limit must match pattern "^([1-9]|100)|undefined$"',
      );
    });

    it("should fail when limit is above the maximum", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?limit=200",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.detail).toBe("Limit must be between 1 and 100");
    });

    it("should fail with illegal offset query params", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?offset=-10",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        'querystring/offset must match pattern "^[0-9][0-9]*|undefined$"',
      );
    });

    it("should fail with invalid dateFrom format", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?dateFrom=invalid-date",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe('querystring/dateFrom must match format "date"');
    });

    it("should fail with invalid dateTo format", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?dateTo=invalid-date",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe('querystring/dateTo must match format "date"');
    });

    it("should return filtered results with valid date range", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?dateFrom=2024-01-01&dateTo=2024-12-31",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(200);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("metadata");
      expect(body.metadata).toHaveProperty("totalCount");
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should return empty results when no events exist", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(200);
      expect(body.data).toEqual([]);
    });

    it("should fail with illegal status query params", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events?status=hello",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "querystring/status must be equal to one of the allowed values",
      );
    });
  });

  suite("get one message event", async () => {
    it("should fail with illegal eventId url param", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/message-events/123",
      });

      const body = await res.json();
      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe('params/eventId must match format "uuid"');
    });
  });
});
