import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { utils } from "../../utils/utils.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../build-testcontainer-pg.js";
import { build } from "../test-server-builder.js";

// Like delete-messages.test.ts, only cases that need no ProfileSDK mock.

describe.each(["restore", "erase"] as const)(
  "POST /api/v1/messages/%s",
  (action) => {
    let pool: Pool;
    let app: FastifyInstance | undefined;
    const url = `/api/v1/messages/${action}`;

    beforeAll(() => {
      pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
    });

    afterAll(async () => {
      await pool?.end();
    });

    afterEach(() => {
      app?.close();
      app = undefined;
    });

    it("returns 403 if a public servant is logged in", async () => {
      app = await getServer(randomUUID().substring(0, 12), "pub-ser");

      const res = await app.inject({
        method: "POST",
        url,
        payload: { ids: [randomUUID()] },
      });

      expect(res.statusCode).toBe(403);
    });

    it.each([
      ["empty body", {}],
      ["ids not an array", { ids: "nope" }],
      ["empty ids", { ids: [] }],
      ["non-uuid ids", { ids: ["not-a-uuid"] }],
    ])("returns 422 for %s", async (_name, payload) => {
      app = await getServer(randomUUID().substring(0, 12), undefined);

      const res = await app.inject({ method: "POST", url, payload });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a message that is in the wrong state", async () => {
      const userId = randomUUID().substring(0, 12);
      // a live message can be neither restored nor erased
      const id = await insertMessage(userId, pool);
      app = await getServer(userId, undefined);

      const res = await app.inject({
        method: "POST",
        url,
        payload: { ids: [id] },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 200 and echoes the ids for a deleted message", async () => {
      const userId = randomUUID().substring(0, 12);
      const id = await insertMessage(userId, pool);
      await pool.query("update messages set deleted_at = now() where id = $1", [
        id,
      ]);
      app = await getServer(userId, undefined);

      const res = await app.inject({
        method: "POST",
        url,
        payload: { ids: [id] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.ids).toStrictEqual([id]);
      const { rows } = await pool.query(
        "select deleted_at, erased_at from messages where id = $1",
        [id],
      );
      if (action === "restore") {
        expect(rows[0].deleted_at).toBeNull();
      } else {
        expect(rows[0].erased_at).not.toBeNull();
      }
    });
  },
);

async function getServer(
  userId: string,
  organizationId: string | undefined,
): Promise<FastifyInstance> {
  const server = await build();
  server.addHook("onRequest", async (req: FastifyRequest) => {
    server.checkPermissions = async (
      request: FastifyRequest,
      _reply: FastifyReply,
    ) => {
      req.userData = {
        userId,
        accessToken: "accesstoken",
        organizationId,
        isM2MApplication: false,
      };
      request.userData = req.userData;
    };
  });
  return server;
}

async function insertMessage(userId: string, pool: Pool): Promise<string> {
  const res = await pool.query(
    `insert into messages(is_delivered, user_id, subject, excerpt, plain_text,
      rich_text, security_level, lang, preferred_transports, thread_name,
      organisation_id, scheduled_at, is_seen)
     values(true, $1, 's', 'exc', 'pt', 'rich', 'public', 'en', $2, 'thread', 'org-single', now(), false)
     returning id`,
    [userId, utils.postgresArrayify([""])],
  );
  return res.rows[0].id as string;
}
