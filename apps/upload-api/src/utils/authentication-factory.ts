import { httpErrors } from "@fastify/sensible";
import {
  type BuildingBlocksSDK,
  type DefinedServices,
  getBuildingBlockSDK,
  getM2MTokenFn,
  type TokenFunction,
} from "@ogcio/building-blocks-sdk";
import type { FastifyBaseLogger } from "fastify";

const sdkPerOrganisation: { [organizationId: string]: SetupSdks } = {};

type SetupSdks = DefinedServices<{
  services: {
    scheduler: {
      baseUrl: string;
    };
    profile: { baseUrl: string };
  };
  getTokenFn: TokenFunction;
}>;

const getBaseProfileConfig = (): {
  logtoOidcEndpoint: string;
  applicationId: string;
  applicationSecret: string;
} => ({
  logtoOidcEndpoint: process.env.LOGTO_OIDC_ENDPOINT ?? "",
  applicationId: process.env.LOGTO_M2M_PROFILE_APP_ID ?? "",
  applicationSecret: process.env.LOGTO_M2M_PROFILE_APP_SECRET ?? "",
});

const getBaseSchedulerConfig = (): {
  logtoOidcEndpoint: string;
  applicationId: string;
  applicationSecret: string;
} => ({
  logtoOidcEndpoint: process.env.LOGTO_OIDC_ENDPOINT ?? "",
  applicationId: process.env.LOGTO_M2M_SCHEDULER_APP_ID ?? "",
  applicationSecret: process.env.LOGTO_M2M_SCHEDULER_APP_SECRET ?? "",
});

export const getM2MProfileSdk = async (
  logger: FastifyBaseLogger,
  organizationId: string,
): Promise<BuildingBlocksSDK["profile"]> => {
  return loadBuildingBlocksSdk(organizationId, logger).profile;
};

export const getSchedulerSdk = async (
  organizationId: string,
  logger: FastifyBaseLogger,
): Promise<BuildingBlocksSDK["scheduler"]> => {
  return loadBuildingBlocksSdk(organizationId, logger).scheduler;
};

const loadBuildingBlocksSdk = (
  organizationId: string,
  logger?: FastifyBaseLogger,
): SetupSdks => {
  if (!sdkPerOrganisation[organizationId]) {
    sdkPerOrganisation[organizationId] = getBuildingBlockSDK({
      services: {
        scheduler: { baseUrl: process.env.SCHEDULER_BACKEND_URL ?? "" },
        profile: { baseUrl: process.env.PROFILE_BACKEND_URL ?? "" },
      },
      getTokenFn: getM2MTokenFn({
        services: {
          profile: {
            getOrganizationTokenParams: {
              ...getBaseProfileConfig(),
              scopes: ["profile:user:read"],
              organizationId,
            },
          },
          scheduler: {
            getOrganizationTokenParams: {
              ...getBaseSchedulerConfig(),
              scopes: ["scheduler:jobs:write"],
              organizationId,
            },
          },
        },
      }),
      logger,
    });
  }

  return sdkPerOrganisation[organizationId];
};

export const ensureUserIdIsSet = (
  request: { userData?: { userId?: string } },
  errorMessage: string = "User id is not set",
): string => {
  if (request.userData?.userId) {
    return request.userData.userId;
  }

  throw httpErrors.forbidden(errorMessage);
};

const loadPersonalSdk = (
  userData: { userId: string; accessToken: string },
  logger?: FastifyBaseLogger,
): SetupSdks => {
  return getBuildingBlockSDK({
    services: {
      scheduler: {
        baseUrl: process.env.SCHEDULER_BACKEND_URL ?? "",
      },
      profile: {
        baseUrl: process.env.PROFILE_BACKEND_URL ?? "",
      },
      upload: {
        baseUrl: process.env.UPLOAD_BACKEND_URL ?? "",
      },
    },
    getTokenFn: async (serviceName: string): Promise<string> => {
      if (serviceName !== "profile") {
        throw httpErrors.internalServerError(
          `${serviceName} is not available for personal sdks`,
        );
      }

      return userData.accessToken;
    },
    logger,
  });
};

export const getPersonalProfileSdk = async (
  logger: FastifyBaseLogger,
  userData: { userId: string; accessToken: string },
): Promise<BuildingBlocksSDK["profile"]> => {
  return loadPersonalSdk(userData, logger).profile;
};
