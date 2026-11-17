import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, suite, vi } from "vitest";
import { Permissions } from "../../types/permissions.js";
import { build } from "../test-server-builder.js";

const { processMessageMock, getGeoAttributesMock } = vi.hoisted(() => ({
  processMessageMock: vi.fn(),
  // The request's geo baggage, as the o11y SDK resolves it
  getGeoAttributesMock: vi.fn((): Record<string, string> => ({})),
}));

vi.mock("@ogcio/o11y-sdk-node", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@ogcio/o11y-sdk-node")>();

  return { ...original, getGeoAttributes: getGeoAttributesMock };
});

vi.mock(
  "../../services/messages/message-service.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../services/messages/message-service.js")
      >();

    return {
      ...original,
      processMessage: processMessageMock,
    };
  },
);

describe("POST /api/v1/messages", {}, () => {
  const validMessageBody = {
    security: "public",
    preferredTransports: [],
    recipientUserId: "recipientUserId",
    scheduleAt: "2024-08-27T07:46:10.290Z",
    message: {
      threadName: "thread",
      subject: "subject",
      excerpt: "excerpt",
      plainText: "text",
      richText: "text",
      language: "en",
    },
  };

  let requestedPermissions: string[][] = [];

  const getServer = async (scopes: string[] = []): Promise<FastifyInstance> => {
    const server = await build();
    server.addHook("onRequest", async (req: FastifyRequest) => {
      // Override the request decorator
      server.checkPermissions = async (
        request: FastifyRequest,
        _reply: FastifyReply,
        permissions: string[],
        _matchConfig?: { method: "AND" | "OR" },
      ) => {
        requestedPermissions.push(permissions);
        // biome-ignore lint/complexity/noUselessLoneBlockStatements: it's used
        {
          req.userData = {
            userId: "userId",
            accessToken: "accessToken",
            organizationId: "organisationId",
            isM2MApplication: false,
            scopes,
          };

          request.userData = req.userData;
        }
      };
    });

    return server;
  };

  let app: FastifyInstance | undefined;

  afterEach(() => {
    processMessageMock.mockReset();
    requestedPermissions = [];
    if (app) {
      app.close();
      app = undefined;
    }
  });

  suite("create message schema validations", () => {
    it("with illegal preferredTransports should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          preferredTransports: ["air", "earth", "bear"],
          recipientUserId: "",
          security: "confidential",
          scheduleAt: "",
          message: {
            threadName: "name",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body/preferredTransports/0 must be equal to one of the allowed values",
      );
    });

    it("with null preferredTransports should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "confidential",
          preferredTransports: null,
          recipientUserId: "",
          scheduleAt: "",
          message: {
            threadName: "kk",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/preferredTransports must be array");
    });

    it("with illegal security should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "illegal",
          preferredTransports: [],
          recipientUserId: "",
          scheduleAt: "",
          message: {
            threadName: "name",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body/security must be equal to one of the allowed values",
      );
    });

    it("with null security should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: null,
          preferredTransports: [],
          recipientUserId: "",
          scheduleAt: "",
          message: {
            threadName: "kk",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/security must be string");
    });

    it("with null recipientUserId should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "illegal",
          preferredTransports: [],
          recipientUserId: null,
          scheduleAt: "",
          message: {
            threadName: "name",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/recipientUserId must be string");
    });

    it("with no recipientUserId should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "illegal",
          preferredTransports: [],
          scheduleAt: "",
          message: {
            threadName: "name",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body must have required property 'recipientUserId'",
      );
    });

    it("with null scheduleAt should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: null,
          message: {
            threadName: "name",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/scheduleAt must be string");
    });

    it("with illegal scheduleAt should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "not a date time",
          message: {
            threadName: "name",
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe('body/scheduleAt must match format "date-time"');
    });

    it("with null message.threadName should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: null,
            subject: "subject",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/message/threadName must be string");
    });

    it("with null message.subject should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: null,
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/message/subject must be string");
    });

    it("with no message.subject should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            excerpt: "excerpt",
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body/message must have required property 'subject'",
      );
    });

    it("with null message.excerpt should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: "subject",
            excerpt: null,
            plainText: "text",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/message/excerpt must be string");
    });

    it("with null message.plainText should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: "subject",
            excerpt: "exc",
            plainText: null,
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/message/plainText must be string");
    });

    it("with no message.plainText should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: "subject",
            excerpt: "exc",
            richText: "text",
            language: "en",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body/message must have required property 'plainText'",
      );
    });

    it("with null message.language should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: "subject",
            excerpt: "exc",
            plainText: "text",
            richText: "text",
            language: null,
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/message/language must be string");
    });

    it("with no message.language should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: "subject",
            excerpt: "exc",
            plainText: "text",
            richText: "text",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body/message must have required property 'language'",
      );
    });

    it("with illegal message.language should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          security: "public",
          preferredTransports: [],
          recipientUserId: "id",
          scheduleAt: "2024-08-27T07:46:10.290Z",
          message: {
            threadName: "thread",
            subject: "subject",
            excerpt: "exc",
            plainText: "text",
            richText: "text",
            language: "sv",
          },
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(
        "body/message/language must be equal to one of the allowed values",
      );
    });

    it("with null bypassConsent should fail", async () => {
      app = await getServer();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          ...validMessageBody,
          bypassConsent: null,
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe("body/bypassConsent must be boolean");
    });

    it("with bypassConsent true should require platform write scope", async () => {
      app = await getServer([Permissions.Message.Write]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          ...validMessageBody,
          bypassConsent: true,
        },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(403);
      expect(body.detail).toBe(
        "Cannot bypass recipient consent without messaging consent override scope",
      );
      expect(processMessageMock).not.toHaveBeenCalled();
    });

    it("with bypassConsent false should not require platform write scope", async () => {
      processMessageMock.mockResolvedValueOnce({
        messageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      });
      app = await getServer([Permissions.Message.Write]);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: {
          ...validMessageBody,
          bypassConsent: false,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(processMessageMock).toHaveBeenCalledOnce();
    });
  });

  suite("metadata", () => {
    const journey = {
      journeyId: "11111111-1111-1111-1111-111111111111",
      submissionId: "sub-0042",
      journeyStep: 2,
      messageTemplateId: "journey-template-7",
    };
    const TEMPLATE_ID_MAX_LENGTH = 128;

    // Sends the message with the given metadata, as an M2M application would
    async function sendWithMetadata(metadata: unknown) {
      processMessageMock.mockResolvedValueOnce({
        messageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      });
      app = await getServer([Permissions.Message.Write]);

      return app.inject({
        method: "POST",
        url: "/api/v1/messages",
        body: { ...validMessageBody, metadata },
      });
    }

    it("passes the journey part of Message metadata on to the message", async () => {
      const res = await sendWithMetadata({ journey });

      expect(res.statusCode).toBe(201);
      expect(processMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({ metadata: { journey } }),
        }),
      );
    });

    // The geohash comes from the request's baggage, never from the payload
    it.each<{
      name: string;
      baggage: Record<string, string>;
      geohash: string | undefined;
    }>([
      { name: "a geohash", baggage: { "geo.hash": "gcpv" }, geohash: "gcpv" },
      { name: "no geohash", baggage: {}, geohash: undefined },
      {
        name: "a malformed geohash",
        baggage: { "geo.hash": "GCPV" },
        geohash: undefined,
      },
    ])(
      "passes $name from the request's baggage on to the message",
      async ({ baggage, geohash }) => {
        getGeoAttributesMock.mockReturnValueOnce(baggage);

        const res = await sendWithMetadata({ journey });

        expect(res.statusCode).toBe(201);
        expect(processMessageMock.mock.lastCall?.[0].geohash).toBe(geohash);
      },
    );

    // Every value becomes a metric label, so malformed ones never get in
    it.each([
      {
        name: "a negative step",
        change: { journeyStep: -1 },
        detail: "journey/journeyStep must be >= 0",
      },
      {
        name: "a fractional step",
        change: { journeyStep: 1.5 },
        detail: "journey/journeyStep must be integer",
      },
      {
        name: "a step above 100",
        change: { journeyStep: 101 },
        detail: "journey/journeyStep must be <= 100",
      },
      {
        name: "a journeyId that is not a UUID",
        change: { journeyId: "journey-1" },
        detail: 'journey/journeyId must match format "uuid"',
      },
      {
        name: "a 7-character submissionId",
        change: { submissionId: "sub-004" },
        detail: "journey/submissionId must NOT have fewer than 8 characters",
      },
      {
        name: "a 9-character submissionId",
        change: { submissionId: "sub-00042" },
        detail: "journey/submissionId must NOT have more than 8 characters",
      },
      {
        name: "an empty messageTemplateId",
        change: { messageTemplateId: "" },
        detail:
          "journey/messageTemplateId must NOT have fewer than 1 characters",
      },
      {
        name: `a messageTemplateId longer than ${TEMPLATE_ID_MAX_LENGTH} characters`,
        change: { messageTemplateId: "t".repeat(TEMPLATE_ID_MAX_LENGTH + 1) },
        detail: `journey/messageTemplateId must NOT have more than ${TEMPLATE_ID_MAX_LENGTH} characters`,
      },
      {
        name: "a missing submissionId",
        change: { submissionId: undefined },
        detail: "journey must have required property 'submissionId'",
      },
    ])("rejects $name", async ({ change, detail }) => {
      const res = await sendWithMetadata({
        journey: { ...journey, ...change },
      });
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.detail).toBe(`body/metadata/${detail}`);
      expect(processMessageMock).not.toHaveBeenCalled();
    });

    it("accepts step 100, the last step a journey can have", async () => {
      const res = await sendWithMetadata({
        journey: { ...journey, journeyStep: 100 },
      });

      expect(res.statusCode).toBe(201);
    });

    it("rejects empty metadata, as the public API does", async () => {
      const res = await sendWithMetadata({});
      const body = await res.json();

      expect(res.statusCode).toBe(422);
      expect(body.detail).toBe(
        "body/metadata must NOT have fewer than 1 properties",
      );
      expect(processMessageMock).not.toHaveBeenCalled();
    });

    it("drops properties outside the journey context", async () => {
      const res = await sendWithMetadata({
        journey: { ...journey, geohash: "gcpv", address: "1 Main Street" },
        tracking: "x",
      });

      expect(res.statusCode).toBe(201);
      expect(processMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({ metadata: { journey } }),
        }),
      );
    });
  });
});
