import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"
import { requiredInProduction } from "./utils"

const requiredUrl = z.url()
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
)

export const env = createEnv({
  client: {
    NEXT_PUBLIC_BASE_URL: requiredUrl.default("http://localhost:4002"),
    NEXT_PUBLIC_SAG_URL: requiredUrl,
    // Fail closed in production (Faro URL posture) — localhost defaults live
    // in `.env.sample` for local/dev, not in the schema, so a production
    // build without these cannot bake localhost into auth redirects.
    NEXT_PUBLIC_MESSAGING_URL: optionalUrl.superRefine(requiredInProduction),
    NEXT_PUBLIC_PROFILE_URL: optionalUrl.superRefine(requiredInProduction),
    NEXT_PUBLIC_MESSAGING_ADMIN_URL:
      optionalUrl.superRefine(requiredInProduction),
    NEXT_PUBLIC_PROFILE_ADMIN_URL:
      optionalUrl.superRefine(requiredInProduction),

    NEXT_PUBLIC_UNLEASH_URL: optionalUrl,
    NEXT_PUBLIC_UNLEASH_CLIENT_KEY: z.string().optional(),
    NEXT_PUBLIC_UNLEASH_APP_NAME: z.string().default("messaging-admin"),

    NEXT_PUBLIC_ANALYTICS_URL: optionalUrl,
    NEXT_PUBLIC_ANALYTICS_WEBSITE_ID: z.string().optional(),
    NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID: z.string().default("ogcio"),
    NEXT_PUBLIC_ANALYTICS_DRY_RUN: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),

    NEXT_PUBLIC_FARO_URL: optionalUrl.superRefine(requiredInProduction),
    NEXT_PUBLIC_FARO_SERVICE_NAME: z
      .string()
      .optional()
      .superRefine(requiredInProduction)
      .default("messaging-admin"),
    NEXT_PUBLIC_FARO_SERVICE_NAMESPACE: z
      .string()
      .optional()
      .superRefine(requiredInProduction)
      .default("messaging"),
    NEXT_PUBLIC_FARO_PROPAGATE_TRACE_HEADER: z
      .string()
      .optional()
      .superRefine(requiredInProduction),
    NEXT_PUBLIC_VERSION: z.string().default(process.env.version ?? "0.0.0"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_SAG_URL: process.env.NEXT_PUBLIC_SAG_URL,
    NEXT_PUBLIC_MESSAGING_URL: process.env.NEXT_PUBLIC_MESSAGING_URL,
    NEXT_PUBLIC_PROFILE_URL: process.env.NEXT_PUBLIC_PROFILE_URL,
    NEXT_PUBLIC_MESSAGING_ADMIN_URL:
      process.env.NEXT_PUBLIC_MESSAGING_ADMIN_URL,
    NEXT_PUBLIC_PROFILE_ADMIN_URL: process.env.NEXT_PUBLIC_PROFILE_ADMIN_URL,
    NEXT_PUBLIC_UNLEASH_URL: process.env.NEXT_PUBLIC_UNLEASH_URL,
    NEXT_PUBLIC_UNLEASH_CLIENT_KEY: process.env.NEXT_PUBLIC_UNLEASH_CLIENT_KEY,
    NEXT_PUBLIC_UNLEASH_APP_NAME: process.env.NEXT_PUBLIC_UNLEASH_APP_NAME,
    NEXT_PUBLIC_ANALYTICS_URL: process.env.NEXT_PUBLIC_ANALYTICS_URL,
    NEXT_PUBLIC_ANALYTICS_WEBSITE_ID:
      process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID,
    NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID:
      process.env.NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID,
    NEXT_PUBLIC_ANALYTICS_DRY_RUN: process.env.NEXT_PUBLIC_ANALYTICS_DRY_RUN,
    NEXT_PUBLIC_FARO_URL: process.env.NEXT_PUBLIC_FARO_URL,
    NEXT_PUBLIC_FARO_SERVICE_NAME: process.env.NEXT_PUBLIC_FARO_SERVICE_NAME,
    NEXT_PUBLIC_FARO_SERVICE_NAMESPACE:
      process.env.NEXT_PUBLIC_FARO_SERVICE_NAMESPACE,
    NEXT_PUBLIC_FARO_PROPAGATE_TRACE_HEADER:
      process.env.NEXT_PUBLIC_FARO_PROPAGATE_TRACE_HEADER,
    NEXT_PUBLIC_VERSION: process.env.version,
  },
})
