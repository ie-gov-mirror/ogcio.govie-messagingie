import { getBuildingBlockSDK, getM2MTokenFn } from "@ogcio/building-blocks-sdk";
import type { Messaging } from "@ogcio/building-blocks-sdk/dist/client/clients/messaging/index.js";
import type { Profile } from "@ogcio/building-blocks-sdk/dist/client/clients/profile/index.js";
import type { Upload } from "@ogcio/building-blocks-sdk/dist/client/clients/upload/index.js";
import type { SeederConfiguration } from "../configuration.js";

export type SeederSDKs = {
  profile: Profile;
  messaging: Messaging;
  upload: Upload;
};

type PersonalAccessToken = {
  value: string;
  expiresAt: number | null;
};

type ExchangedAccessToken = {
  accessToken: string;
  expiresAt: number;
};

// Map to store PATs: userId -> PAT info
const personalAccessTokens = new Map<string, PersonalAccessToken>();

// Map to store exchanged access tokens: userId -> access token info
const exchangedAccessTokens = new Map<string, ExchangedAccessToken>();

// Cache for management API token (short-lived, will be refreshed as needed)
let managementApiToken: string | null = null;
let managementApiTokenExpiresAt = 0;

/**
 * Creates and initializes SDK clients for profile, messaging, and upload services
 * with M2M authentication and proper scopes
 */
export function createSeederSDKs(config: SeederConfiguration): SeederSDKs {
  const sdk = getBuildingBlockSDK({
    services: {
      profile: {
        baseUrl: config.profileApiBaseUrl,
      },
      messaging: {
        baseUrl: config.messagingApiBaseUrl,
      },
      upload: {
        baseUrl: config.uploadApiBaseUrl,
      },
    },
    getTokenFn: getM2MTokenFn({
      services: {
        profile: {
          getOrganizationTokenParams: {
            logtoOidcEndpoint: config.logtoOidcEndpoint,
            applicationId: config.profileM2MAppId,
            applicationSecret: config.profileM2MAppSecret,
            scopes: ["profile:user.admin:*"],
            organizationId: config.organizationId,
          },
        },
        messaging: {
          getOrganizationTokenParams: {
            logtoOidcEndpoint: config.logtoOidcEndpoint,
            applicationId: config.messagingM2MAppId,
            applicationSecret: config.messagingM2MAppSecret,
            scopes: ["messaging:message:*"],
            organizationId: config.organizationId,
          },
        },
        upload: {
          getOrganizationTokenParams: {
            logtoOidcEndpoint: config.logtoOidcEndpoint,
            applicationId: config.uploadM2MAppId,
            applicationSecret: config.uploadM2MAppSecret,
            scopes: ["upload:file:*"],
            organizationId: config.organizationId,
          },
        },
      },
    }),
  });

  return {
    profile: sdk.profile,
    messaging: sdk.messaging,
    upload: sdk.upload,
  };
}

/**
 * Gets a Logto management API access token using client credentials
 */
export async function getManagementApiToken(
  config: SeederConfiguration,
): Promise<string> {
  // Return cached token if still valid (with 1 minute buffer)
  const now = Date.now();
  if (managementApiToken && managementApiTokenExpiresAt > now + 60000) {
    return managementApiToken;
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", config.logtoManagementAppId);
  params.append("client_secret", config.logtoManagementAppSecret);
  params.append("resource", "https://default.logto.app/api");
  params.append("scope", "all");

  const tokenUrl = `${config.logtoOidcEndpoint}/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get management API token: ${response.status} ${errorText}`,
    );
  }

  const tokenData = await response.json();
  if (!tokenData.access_token) {
    throw new Error("No access_token in management API response");
  }

  managementApiToken = tokenData.access_token;
  // Set expiration to 1 hour from now (typical token lifetime)
  // Subtract 5 minutes as buffer
  managementApiTokenExpiresAt =
    now + (tokenData.expires_in || 3600) * 1000 - 5 * 60 * 1000;

  // At this point, managementApiToken is guaranteed to be non-null
  return managementApiToken as string;
}

/**
 * Creates a personal access token for a user with 5-minute expiration
 */
async function createPersonalAccessToken(
  config: SeederConfiguration,
  userId: string,
): Promise<PersonalAccessToken> {
  const managementToken = await getManagementApiToken(config);

  // Calculate expiration: 5 minutes from now
  const expiresAt = Date.now() + 5 * 60 * 1000;

  const tokenName = `seeder-${Date.now()}`;
  // Normalize endpoint URL (remove trailing slash if present)
  const baseUrl = config.logtoManagementApiEndpoint.replace(/\/$/, "");
  const response = await fetch(
    `${baseUrl}/users/${userId}/personal-access-tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managementToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: tokenName,
        expiresAt: expiresAt,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create personal access token for user ${userId}: ${response.status} ${errorText}`,
    );
  }

  const tokenData = await response.json();
  if (!tokenData.value) {
    throw new Error("No token value in personal access token response");
  }

  return {
    value: tokenData.value,
    expiresAt: tokenData.expiresAt,
  };
}

/**
 * Exchanges a personal access token for a user access token
 * Following the Logto token exchange flow: https://docs.logto.io/user-management/personal-access-token#request
 */
async function exchangePersonalAccessTokenForUserToken(
  config: SeederConfiguration,
  personalAccessToken: string,
): Promise<ExchangedAccessToken> {
  const params = new URLSearchParams();
  params.append(
    "grant_type",
    "urn:ietf:params:oauth:grant-type:token-exchange",
  );
  params.append("scope", "profile:user.self:read profile:user.self:write");
  params.append("subject_token", personalAccessToken);
  params.append(
    "subject_token_type",
    "urn:logto:token-type:personal_access_token",
  );
  params.append("resource", config.profileApiBaseUrl);

  const tokenUrl = `${config.logtoOidcEndpoint}/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${config.logtoTokenExchangeClientId}:${config.logtoTokenExchangeClientSecret}`)}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to exchange personal access token for user token: ${response.status} ${errorText}`,
    );
  }

  const tokenData = await response.json();
  if (!tokenData.access_token) {
    throw new Error("No access_token in token exchange response");
  }

  const now = Date.now();
  const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour if not specified
  const expiresAt = now + expiresIn * 1000;

  return {
    accessToken: tokenData.access_token,
    expiresAt: expiresAt,
  };
}

/**
 * Gets a personal access token for a user, creating one if needed or expired
 */
async function getOrCreatePersonalAccessToken(
  config: SeederConfiguration,
  userId: string,
): Promise<string> {
  const cached = personalAccessTokens.get(userId);
  const now = Date.now();

  // Check if token exists and is still valid (with 30 second buffer)
  if (cached) {
    if (cached.expiresAt === null || cached.expiresAt > now + 30000) {
      return cached.value;
    }
    // Token expired, remove from cache
    personalAccessTokens.delete(userId);
    // Also remove the exchanged token since PAT is expired
    exchangedAccessTokens.delete(userId);
  }

  // Create new token
  const token = await createPersonalAccessToken(config, userId);
  personalAccessTokens.set(userId, token);

  return token.value;
}

/**
 * Gets an exchanged access token for a user, exchanging PAT if needed
 */
async function getPersonalAccessToken(
  config: SeederConfiguration,
  userId: string,
): Promise<string> {
  const cached = exchangedAccessTokens.get(userId);
  const now = Date.now();
  // Check if exchanged token exists and is still valid (with 30 second buffer)
  if (cached) {
    if (cached.expiresAt > now + 30000) {
      return cached.accessToken;
    }
    // Token expired, remove from cache
    exchangedAccessTokens.delete(userId);
  }
  // Get or create PAT
  const pat = await getOrCreatePersonalAccessToken(config, userId);
  // Exchange PAT for user access token
  const exchangedToken = await exchangePersonalAccessTokenForUserToken(
    config,
    pat,
  );

  exchangedAccessTokens.set(userId, exchangedToken);
  return exchangedToken.accessToken;
}

/**
 * Gets a Profile SDK instance for a citizen user, using personal access token for impersonation
 */
export async function getProfileSdkForCitizen(
  config: SeederConfiguration,
  userId: string,
): Promise<Profile> {
  const sdk = getBuildingBlockSDK({
    services: {
      profile: { baseUrl: config.profileApiBaseUrl },
    },
    getTokenFn: async (serviceName: string) => {
      if (serviceName === "profile") {
        return await getPersonalAccessToken(config, userId);
      }
      throw new Error(`Not valid service ${serviceName}`);
    },
  });

  return sdk.profile;
}
