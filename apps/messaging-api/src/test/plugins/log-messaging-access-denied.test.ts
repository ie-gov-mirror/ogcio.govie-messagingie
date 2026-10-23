import { Writable } from "node:stream";
import { httpErrors } from "@fastify/sensible";
import type { ExtractedUserData } from "@ogcio/api-auth";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  MESSAGING_ACCESS_DENIED,
  registerMessagingAccessDeniedLog,
} from "../../plugins/internal/log-messaging-access-denied.js";
import { Permissions } from "../../types/permissions.js";

const MESSAGE_ID = "msg-leak-9f3a";
const RECIPIENT_ID = "recipient-leak-9f3a";
const USER_ID = "user-leak-9f3a";
const ORG_ID = "org-leak-9f3a";
const TOKEN = "token-leak-9f3a";
const ACTOR = "actor-leak-9f3a";
const REFERER_PATH = "ref-leak-9f3a";
const USER_AGENT = "ua-leak-9f3a";

describe("messaging access denied log", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("warns with safe fields and still returns 403", async () => {
    const lines: string[] = [];
    app = buildApp(lines);
    await app.register(
      async (scope) => {
        scope.get("/:messageId", async (request) => {
          request.userData = {
            userId: USER_ID,
            organizationId: ORG_ID,
            accessToken: TOKEN,
            isM2MApplication: true,
            scopes: [
              Permissions.MessageOnboarding.Read,
              Permissions.MessageSelf.Read,
            ],
          } satisfies ExtractedUserData;
          throw httpErrors.forbidden("You can't access this user's data");
        });
      },
      { prefix: "/api/v1/messages" },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${MESSAGE_ID}?recipientUserId=${RECIPIENT_ID}`,
      headers: {
        referer: `https://citizen.example/inbox/${REFERER_PATH}`,
        "x-request-actor-type": ACTOR,
        "user-agent": USER_AGENT,
        authorization: `Bearer ${TOKEN}`,
      },
    });

    expect(response.statusCode).toBe(403);
    const denial = denialLine(lines);
    expect(denial).toMatchObject({
      code: MESSAGING_ACCESS_DENIED,
      route: "GET /api/v1/messages/:messageId",
      subjectMatchesRecipient: false,
      organisationPresent: true,
      hasOnboardingRead: true,
      hasOrganisationAudience: true,
      actorType: "other",
      referrerHost: "citizen.example",
      detail: "You can't access this user's data",
      msg: MESSAGING_ACCESS_DENIED,
    });
    expect(denial).not.toHaveProperty("requestId");
    assertNoSecrets(JSON.stringify(denial));
  });

  it("logs a generic Forbidden without a verified user and keeps the status", async () => {
    const lines: string[] = [];
    app = buildApp(lines);
    app.get(
      "/api/v1/messages",
      {
        preValidation: async () => {
          throw httpErrors.forbidden();
        },
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      headers: {
        referer: "https://citizen.example/inbox",
        "x-request-actor-type": "M2M",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(denialLine(lines)).toEqual({
      level: expect.any(Number),
      time: expect.any(Number),
      pid: expect.any(Number),
      hostname: expect.any(String),
      reqId: expect.any(String),
      code: MESSAGING_ACCESS_DENIED,
      route: "GET /api/v1/messages",
      actorType: "m2m",
      referrerHost: "citizen.example",
      detail: "Forbidden",
      msg: MESSAGING_ACCESS_DENIED,
    });
  });

  it("omits a detail that contains an id and ignores non-403 errors", async () => {
    const lines: string[] = [];
    app = buildApp(lines);
    app.get("/api/v1/messages/:messageId", async () => {
      throw httpErrors.forbidden(`Not allowed to read ${MESSAGE_ID}`);
    });
    app.get("/api/v1/boom", async () => {
      throw httpErrors.internalServerError("boom");
    });

    const denied = await app.inject({
      method: "GET",
      url: `/api/v1/messages/${MESSAGE_ID}`,
    });
    const failed = await app.inject({
      method: "GET",
      url: "/api/v1/boom",
    });

    expect(denied.statusCode).toBe(403);
    expect(failed.statusCode).toBe(500);
    const denial = denialLine(lines);
    expect(denial).toMatchObject({
      code: MESSAGING_ACCESS_DENIED,
      route: "GET /api/v1/messages/:messageId",
      actorType: "absent",
    });
    expect(denial).not.toHaveProperty("detail");
    expect(denial).not.toHaveProperty("organisationPresent");
    assertNoSecrets(JSON.stringify(denial));
    expect(
      lines.filter((line) => line.includes(MESSAGING_ACCESS_DENIED)),
    ).toHaveLength(1);
  });
});

function buildApp(lines: string[]): FastifyInstance {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const app = fastify({
    logger: { level: "warn", stream },
  });
  registerMessagingAccessDeniedLog(app);
  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      typeof error.statusCode === "number" ? error.statusCode : 500;
    reply.status(statusCode).send({ statusCode });
  });
  return app;
}

function denialLine(lines: string[]): Record<string, unknown> {
  const line = lines.find((entry) => entry.includes(MESSAGING_ACCESS_DENIED));
  expect(line).toBeDefined();
  return JSON.parse(line ?? "{}") as Record<string, unknown>;
}

function assertNoSecrets(serialized: string): void {
  for (const secret of [
    MESSAGE_ID,
    RECIPIENT_ID,
    USER_ID,
    ORG_ID,
    TOKEN,
    ACTOR,
    REFERER_PATH,
    USER_AGENT,
    Permissions.MessageOnboarding.Read,
    Permissions.MessageSelf.Read,
    "127.0.0.1",
  ]) {
    expect(serialized).not.toContain(secret);
  }
}
