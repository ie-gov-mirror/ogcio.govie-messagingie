import type { BuildingBlocksSDK } from "@ogcio/building-blocks-sdk";
import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureUserIdIsSet } from "../../utils/authentication-factory.js";

describe("authentication-factory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getSchedulerSdk builds scheduler using the external sdks", async () => {
    vi.doMock("@ogcio/building-blocks-sdk", () => ({
      getBuildingBlockSDK: (_params: {
        services: { scheduler: { baseUrl: string } };
        getTokenFn: (serviceName: string) => string;
      }): BuildingBlocksSDK => {
        return {
          scheduler: {
            sayHello: "Hello",
          } as unknown as BuildingBlocksSDK["scheduler"],
        } as BuildingBlocksSDK;
      },
      getM2MTokenFn: (_params: {
        services: {
          scheduler: {
            getOrganizationTokenParams: {
              [x: string]: unknown;
            };
          };
        };
      }) => "token",
    }));

    const { getSchedulerSdk } = await import(
      "../../utils/authentication-factory.js"
    );

    const mockLogger = {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      fatal: () => {},
      trace: () => {},
      child: () => mockLogger,
    } as unknown as FastifyBaseLogger;
    const returnedScheduler = (await getSchedulerSdk(
      "organizationId",
      mockLogger,
    )) as { sayHello?: string } | undefined;

    expect(returnedScheduler?.sayHello).toBe("Hello");
  });

  it("getM2MProfileSdk requests an org token with profile:user:read", async () => {
    let tokenConfig:
      | {
          services?: {
            profile?: {
              getOrganizationTokenParams?: {
                scopes?: string[];
                organizationId?: string;
              };
            };
          };
        }
      | undefined;

    vi.doMock("@ogcio/building-blocks-sdk", () => ({
      getBuildingBlockSDK: () =>
        ({
          profile: { name: "profile" },
        }) as unknown as BuildingBlocksSDK,
      getM2MTokenFn: (params: typeof tokenConfig) => {
        tokenConfig = params;
        return async () => "token";
      },
    }));

    const { getM2MProfileSdk } = await import(
      "../../utils/authentication-factory.js"
    );
    const mockLogger = {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      fatal: () => {},
      trace: () => {},
      child: () => mockLogger,
    } as unknown as FastifyBaseLogger;

    const sdk = (await getM2MProfileSdk(mockLogger, "organizationId")) as {
      name?: string;
    };

    expect(sdk.name).toBe("profile");
    expect(
      tokenConfig?.services?.profile?.getOrganizationTokenParams?.scopes,
    ).toEqual(["profile:user:read"]);
    expect(
      tokenConfig?.services?.profile?.getOrganizationTokenParams
        ?.organizationId,
    ).toBe("organizationId");
  });

  it("ensureUserIdIsSet returns user id", () => {
    expect(
      ensureUserIdIsSet({ userData: { userId: "userId" } }, "DUMMY_PROCESS"),
    ).toBe("userId");
  });

  it("ensureUserIdIsSet throws an error if userId is not set", () => {
    expect(() => ensureUserIdIsSet({}, "DUMMY_PROCESS")).toThrowError(
      "DUMMY_PROCESS",
    );
  });
});
