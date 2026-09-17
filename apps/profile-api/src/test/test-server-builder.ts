import type { FastifyReply, FastifyRequest } from "fastify";
import fastify from "fastify";
import fp from "fastify-plugin";
import { Permissions } from "~/const/permissions.js";
import buildServer from "~/server.js";

declare module "fastify" {
  interface FastifyInstance {}
}

// automatically build and tear down our instance
export async function build() {
  const app = fastify({
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: "all",
      },
    },
  });

  app.register(fp(buildServer));

  return app;
}

export interface MockAuthConfig {
  userId: string;
  accessToken?: string;
  organizationId?: string;
  isM2MApplication?: boolean;
  /**
   * Set to true to grant onboarding permission checks after authentication.
   */
  hasOnboardingPermissions?: boolean;
}

/**
 * Builds the Fastify app once and installs an onRequest hook that reads
 * auth config from a mutable ref. Tests update `setAuth(config)` between
 * requests instead of rebuilding the entire app.
 */
export async function buildOnce() {
  const app = await build();

  let currentAuth: MockAuthConfig = {
    userId: "test-user",
    accessToken: "accessToken",
    isM2MApplication: false,
  };

  app.addHook("onRequest", async (req: FastifyRequest) => {
    let callCount = 0;
    app.checkPermissions = async (
      request: FastifyRequest,
      _reply: FastifyReply,
      permissions: string[],
      _matchConfig?: { method: "AND" | "OR" },
    ) => {
      if (
        currentAuth.hasOnboardingPermissions === undefined ||
        callCount === 0
      ) {
        req.userData = {
          userId: currentAuth.userId,
          accessToken: currentAuth.accessToken ?? "accessToken",
          organizationId: currentAuth.organizationId,
          isM2MApplication: currentAuth.isM2MApplication ?? false,
        };
        request.userData = req.userData;
        callCount++;
        return;
      }

      // Secondary permission check
      if (
        !currentAuth.hasOnboardingPermissions ||
        !permissions.includes(Permissions.UserOnboarding.Read)
      ) {
        throw new Error();
      }
    };
  });

  const setAuth = (config: MockAuthConfig) => {
    currentAuth = config;
  };

  return { app, setAuth };
}
