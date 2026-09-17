export const DEFAULT_CALLBACK_MAX_ITEMS = 1000;
export const DEFAULT_CALLBACK_RATE_LIMIT_MAX = 60;
export const DEFAULT_CALLBACK_RATE_LIMIT_WINDOW_MS = 60_000;

export const envSchema = {
  type: "object",
  required: [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DB_NAME",
    "LOGTO_OIDC_ENDPOINT",
    "LOGTO_JWK_ENDPOINT",
    "LOGTO_API_RESOURCE_INDICATOR",
    "LOG_LEVEL",
  ],
  properties: {
    POSTGRES_USER: {
      type: "string",
    },
    POSTGRES_PASSWORD: {
      type: "string",
    },
    POSTGRES_HOST: {
      type: "string",
    },
    POSTGRES_PORT: {
      type: "number",
    },
    POSTGRES_DB_NAME: {
      type: "string",
    },
    LOGTO_OIDC_ENDPOINT: {
      type: "string",
    },
    LOGTO_JWK_ENDPOINT: {
      type: "string",
    },
    LOGTO_API_RESOURCE_INDICATOR: {
      type: "string",
    },
    LOG_LEVEL: {
      type: "string",
      default: "debug",
    },
    POSTGRES_SSL: {
      type: "boolean",
      default: false,
    },
    CALLBACK_MAX_ITEMS: {
      type: "number",
      default: DEFAULT_CALLBACK_MAX_ITEMS,
    },
    CALLBACK_RATE_LIMIT_MAX: {
      type: "number",
      default: DEFAULT_CALLBACK_RATE_LIMIT_MAX,
    },
    CALLBACK_RATE_LIMIT_WINDOW_MS: {
      type: "number",
      default: DEFAULT_CALLBACK_RATE_LIMIT_WINDOW_MS,
    },
  },
};

export interface EnvDbConfig {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB_NAME: string;
  POSTGRES_SSL: boolean;
}
