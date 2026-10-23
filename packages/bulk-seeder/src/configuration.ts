export type SeederConfiguration = {
  // Database connections (only Logto needed)
  logtoDatabaseConnectionString: string;

  // Seeding parameters
  profilesToSeed: number;
  organizationId: string;
  loadTestingEmailPrefix: string;
  loadTestingEmailDomain: string;
  externalIdPrefix: string;

  // SDK configuration
  profileApiBaseUrl: string;
  profileM2MAppId: string;
  profileM2MAppSecret: string;
  messagingApiBaseUrl: string;
  messagingM2MAppId: string;
  messagingM2MAppSecret: string;
  uploadApiBaseUrl: string;
  uploadM2MAppId: string;
  uploadM2MAppSecret: string;
  logtoOidcEndpoint: string;
  logtoManagementApiEndpoint: string;
  logtoManagementAppId: string;
  logtoManagementAppSecret: string;
  logtoTokenExchangeClientId: string;
  logtoTokenExchangeClientSecret: string;
  // Batch processing
  batchSize: number;
  ppsnSearchBatchSize: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
  enableMyGovIdIdentityInjection: boolean;
};

export function getSeederConfiguration(): SeederConfiguration {
  return {
    logtoDatabaseConnectionString: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_DB_CONNECTION_STRING",
      "string",
    ),
    profilesToSeed: ensureValueIsDefined<number>(
      "SEEDER_PROFILES_TO_SEED",
      "number",
    ),
    organizationId: ensureValueIsDefined<string>(
      "SEEDER_ORGANIZATION_ID",
      "string",
    ),

    loadTestingEmailPrefix:
      process.env.SEEDER_LOAD_TESTING_EMAIL_PREFIX ?? "load-test-profile-",
    loadTestingEmailDomain:
      process.env.SEEDER_LOAD_TESTING_EMAIL_DOMAIN ?? "loadtesting.local",
    externalIdPrefix: process.env.SEEDER_EXTERNAL_ID_PREFIX ?? "seed-ext-",
    profileApiBaseUrl: ensureValueIsDefined<string>(
      "SEEDER_PROFILE_API_BASE_URL",
      "string",
    ),
    profileM2MAppId: ensureValueIsDefined<string>(
      "SEEDER_PROFILE_M2M_APP_ID",
      "string",
    ),
    profileM2MAppSecret: ensureValueIsDefined<string>(
      "SEEDER_PROFILE_M2M_APP_SECRET",
      "string",
    ),
    messagingApiBaseUrl: ensureValueIsDefined<string>(
      "SEEDER_MESSAGING_API_BASE_URL",
      "string",
    ),
    messagingM2MAppId: ensureValueIsDefined<string>(
      "SEEDER_MESSAGING_M2M_APP_ID",
      "string",
    ),
    messagingM2MAppSecret: ensureValueIsDefined<string>(
      "SEEDER_MESSAGING_M2M_APP_SECRET",
      "string",
    ),
    uploadApiBaseUrl: ensureValueIsDefined<string>(
      "SEEDER_UPLOAD_API_BASE_URL",
      "string",
    ),
    uploadM2MAppId: ensureValueIsDefined<string>(
      "SEEDER_UPLOAD_M2M_APP_ID",
      "string",
    ),
    uploadM2MAppSecret: ensureValueIsDefined<string>(
      "SEEDER_UPLOAD_M2M_APP_SECRET",
      "string",
    ),
    logtoOidcEndpoint: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_OIDC_ENDPOINT",
      "string",
    ),
    logtoManagementApiEndpoint: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_MANAGEMENT_API_ENDPOINT",
      "string",
    ),
    logtoManagementAppId: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_MANAGEMENT_APP_ID",
      "string",
    ),
    logtoManagementAppSecret: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_MANAGEMENT_APP_SECRET",
      "string",
    ),
    logtoTokenExchangeClientId: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_TOKEN_EXCHANGE_CLIENT_ID",
      "string",
    ),
    logtoTokenExchangeClientSecret: ensureValueIsDefined<string>(
      "SEEDER_LOGTO_TOKEN_EXCHANGE_CLIENT_SECRET",
      "string",
    ),
    batchSize: parseOptionalNumber("SEEDER_BATCH_SIZE", 25),
    ppsnSearchBatchSize: parseOptionalNumber(
      "SEEDER_PPSN_SEARCH_BATCH_SIZE",
      50,
    ),
    pollIntervalMs: parseOptionalNumber("SEEDER_POLL_INTERVAL_MS", 2000),
    maxPollAttempts: parseOptionalNumber("SEEDER_MAX_POLL_ATTEMPTS", 300),
    enableMyGovIdIdentityInjection: ["true", "1"].includes(
      ensureValueIsDefined<string>(
        "SEEDER_ENABLE_MYGOVID_IDENTITY_INJECTION",
        "string",
      ).toLowerCase(),
    ),
  };
}

function ensureValueIsDefined<T extends string | number>(
  name: string,
  outputType: "string" | "number",
): T {
  const processValue = process.env[name];
  if (processValue === undefined) {
    console.log("[Configuration] Missing env var:", name);
    throw new Error(`Environment variable ${name} is not defined`);
  }
  if (outputType === "number") {
    const parsedValue = Number.parseInt(processValue, 10);
    if (Number.isNaN(parsedValue)) {
      console.log("[Configuration] Invalid number env var:", name);
      throw new Error(`Environment variable ${name} is not a valid number`);
    }
    return parsedValue as T;
  }

  return processValue as T;
}

function parseOptionalNumber(name: string, defaultValue: number): number {
  const processValue = process.env[name];
  if (processValue === undefined) {
    return defaultValue;
  }
  const parsedValue = Number.parseInt(processValue, 10);
  if (Number.isNaN(parsedValue)) {
    console.log(
      `[Configuration] Invalid number env var: ${name}, using default: ${defaultValue}`,
    );
    return defaultValue;
  }
  return parsedValue;
}
