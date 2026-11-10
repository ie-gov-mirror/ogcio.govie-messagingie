import {
  defineZoneEnv,
  requiredInProduction,
  z,
} from "@citizen-portal/shared/env"

/**
 * App-local client env schema for the unified citizen-portal.
 *
 * Phase B1 brought in the messages-zone vars; Phase B2 adds the
 * profile-zone-specific ones used by the global-signout iframe fan-out
 * and the PS bounce table in `ZONE_CONFIG`:
 *   - `*_ADMIN_URL` per zone (messaging / profile / dashboard) — each
 *     ClientShell zone bounces public servants to the matching admin
 *     app via `useOnboardingGuard`.
 *   - `PAYMENTS_URL` / `JOURNEY_URL` — non-zone apps that the profile
 *     global-signout fan-out also targets.
 *   - `MYGOVID_END_SESSION_URL` — IdP end-session iframe (citizen role
 *     only).
 *
 * Cross-zone host URLs (`NEXT_PUBLIC_MESSAGING_URL`,
 * `NEXT_PUBLIC_PROFILE_URL`, `NEXT_PUBLIC_DASHBOARD_URL`) and SAG config
 * still live in `@citizen-portal/shared` and stay accessible via
 * `useEnv()` / `getEnv()` / `useCrossZoneLink()`. They're declared there
 * (not here) because they cross zone boundaries — see the Phase II plan.
 */

const requiredUrl = z.url()
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
)

/**
 * Boolean build-time flag parser. Build pipelines may pass "true"/"false"
 * (any case), "1"/"0", "yes"/"no", "on"/"off", an empty string, or a
 * stringified YAML boolean — normalize all of them to a real boolean,
 * falling back to `defaultValue` for anything unrecognised. Mirrors the
 * inline pattern already used by `NEXT_PUBLIC_ENABLE_MOCK_MESSAGES` and
 * `NEXT_PUBLIC_ANALYTICS_DRY_RUN`.
 */
const booleanFlag = (defaultValue: "true" | "false") =>
  z
    .preprocess(
      (v) => {
        if (v === undefined || v === null || v === "") return defaultValue
        const s = String(v).trim().toLowerCase()
        if (["true", "1", "yes", "on"].includes(s)) return "true"
        if (["false", "0", "no", "off"].includes(s)) return "false"
        return defaultValue
      },
      z.enum(["true", "false"]),
    )
    .transform((v) => v === "true")

export const env = defineZoneEnv({
  client: {
    NEXT_PUBLIC_BASE_URL: requiredUrl.default(
      "http://messaging.local.test:8080",
    ),
    /**
     * Admin app URLs — each ClientShell zone bounces public servants to
     * the matching admin app via `useOnboardingGuard`. Admin apps are
     * NOT citizen-portal zones; they stay as zone-local env vars.
     */
    NEXT_PUBLIC_MESSAGING_ADMIN_URL: requiredUrl.default(
      "http://localhost:4002",
    ),
    NEXT_PUBLIC_PROFILE_ADMIN_URL: requiredUrl.default("http://localhost:3033"),
    NEXT_PUBLIC_DASHBOARD_ADMIN_URL: requiredUrl.default(
      "http://localhost:3012",
    ),

    /**
     * Non-citizen-portal apps targeted by the profile global-signout
     * iframe fan-out. Promote to `@citizen-portal/shared` if/when they
     * become citizen-portal zones.
     */
    NEXT_PUBLIC_PAYMENTS_URL: requiredUrl.default("http://localhost:3013"),
    NEXT_PUBLIC_JOURNEY_URL: requiredUrl.default("http://localhost:3014"),
    NEXT_PUBLIC_FORMS_URL: requiredUrl.default("http://localhost:4000"),

    /** Optional IdP end-session URL (citizen role only, global signout). */
    NEXT_PUBLIC_MYGOVID_END_SESSION_URL: optionalUrl,

    /** Forms service base URL — used for error reporting redirects */
    NEXT_PUBLIC_FORMS_SERVICE_URL: requiredUrl.default("http://localhost:3004"),
    /** Error form ID appended to the forms service URL */
    NEXT_PUBLIC_ERROR_FORM_ID: z.string().default(""),

    NEXT_PUBLIC_UNLEASH_URL: optionalUrl,
    NEXT_PUBLIC_UNLEASH_CLIENT_KEY: z.string().optional(),
    NEXT_PUBLIC_UNLEASH_APP_NAME: z.string().default("messaging"),

    /**
     * Deployment-topology flags (AB#39580). Build-time only — baked into
     * the static export. All default `true` so every current deployment
     * ships every zone/integration. Set to `false` to drop a building
     * block from a standalone deployment without exposing UI, links, or
     * landing redirects that imply its presence. See
     * `@/lib/feature-config` and the "Feature flags & standalone
     * deployments" section of the app README.
     */
    NEXT_PUBLIC_ENABLE_DASHBOARD: booleanFlag("true"),
    NEXT_PUBLIC_ENABLE_MESSAGING: booleanFlag("true"),
    NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION: booleanFlag("true"),
    NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION: booleanFlag("true"),
    NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION: booleanFlag("true"),

    /**
     * Life Events Accelerator (LEA) flag (AB#40267). Build-time only —
     * baked into the static export. Activates the LEA experience (new
     * dashboard and the link to an application submission from the message
     * view). Unlike the topology flags above it defaults to `false`, so an
     * unconfigured build (and prod, which keeps the default version) ships
     * LEA off; dev and uat set it `true` via the pipeline. See
     * `@/lib/feature-config` and the app README.
     */
    NEXT_PUBLIC_ENABLE_LEA: booleanFlag("false"),

    /**
     * Message folders (AB#42582). Build-time only — baked into the static
     * export. Gates the citizen-portal folder sidebar, move actions, and
     * mobile folder panel. Defaults `false` so an unconfigured build ships
     * folders off; flip via pipeline `nextPublicEnableFolders` when ready.
     * See `@/lib/feature-config` and the app README.
     */
    NEXT_PUBLIC_ENABLE_FOLDERS: booleanFlag("false"),

    /**
     * Dev-only fallback: when the messages API returns an empty list,
     * render a bundled fixture (`src/mock/messages.json`) so the unified
     * inbox has content to show. Defaults to `false`. Set to `true` in
     * local `.env` for UI development without a working backend. Build
     * pipelines may pass "false", "False", or YAML booleans stringified —
     * normalize before strict enum.
     */
    NEXT_PUBLIC_ENABLE_MOCK_MESSAGES: z
      .preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") return "false"
          const s = String(v).trim().toLowerCase()
          if (["true", "1", "yes", "on"].includes(s)) return "true"
          if (["false", "0", "no", "off"].includes(s)) return "false"
          return "false"
        },
        z.enum(["true", "false"]),
      )
      .transform((v) => v === "true"),

    /** Matomo — same IDs as legacy messaging (`ANALYTICS_*`). Optional URL: set directly or via MATOMO_* below. */
    NEXT_PUBLIC_ANALYTICS_URL: optionalUrl,
    NEXT_PUBLIC_MATOMO_URL: z.string().optional(),
    NEXT_PUBLIC_MATOMO_PROTOCOL: z.enum(["http", "https"]).optional(),
    NEXT_PUBLIC_ANALYTICS_WEBSITE_ID: z.string().optional(),
    NEXT_PUBLIC_ANALYTICS_ORGANIZATION_ID: z.string().default("ogcio"),
    /** Build pipelines may pass "false", "False", or YAML booleans stringified — normalize before strict enum. */
    NEXT_PUBLIC_ANALYTICS_DRY_RUN: z
      .preprocess(
        (v) => {
          if (v === undefined || v === null || v === "") return "true"
          const s = String(v).trim().toLowerCase()
          if (["true", "1", "yes", "on"].includes(s)) return "true"
          if (["false", "0", "no", "off"].includes(s)) return "false"
          return "true"
        },
        z.enum(["true", "false"]),
      )
      .transform((v) => v === "true"),

    /** Faro observability configuration */
    NEXT_PUBLIC_FARO_URL: optionalUrl.superRefine(requiredInProduction),
    NEXT_PUBLIC_FARO_SERVICE_NAME: z
      .string()
      .optional()
      .superRefine(requiredInProduction)
      .default("citizen-portal"),
    NEXT_PUBLIC_FARO_SERVICE_NAMESPACE: z
      .string()
      .optional()
      .superRefine(requiredInProduction)
      .default("messaging"),
    NEXT_PUBLIC_FARO_PROPAGATE_TRACE_HEADER: z
      .string()
      .optional()
      .superRefine(requiredInProduction),
    /** Grafana Session Replay (AB#40467). Disabled by default; enable per environment via pipeline. */
    NEXT_PUBLIC_FARO_REPLAY_ENABLED: booleanFlag("false"),
    /**
     * Fraction (0..1) of sampled sessions that are also recorded for replay.
     * Applied on top of Faro's own session sampling.
     */
    NEXT_PUBLIC_FARO_REPLAY_SAMPLING_RATE: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(0),
    NEXT_PUBLIC_VERSION: z.string().default(process.env.version ?? "0.0.0"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_MESSAGING_ADMIN_URL:
      process.env.NEXT_PUBLIC_MESSAGING_ADMIN_URL,
    NEXT_PUBLIC_PROFILE_ADMIN_URL: process.env.NEXT_PUBLIC_PROFILE_ADMIN_URL,
    NEXT_PUBLIC_DASHBOARD_ADMIN_URL:
      process.env.NEXT_PUBLIC_DASHBOARD_ADMIN_URL,
    NEXT_PUBLIC_PAYMENTS_URL: process.env.NEXT_PUBLIC_PAYMENTS_URL,
    NEXT_PUBLIC_JOURNEY_URL: process.env.NEXT_PUBLIC_JOURNEY_URL,
    NEXT_PUBLIC_FORMS_URL: process.env.NEXT_PUBLIC_FORMS_URL,
    NEXT_PUBLIC_MYGOVID_END_SESSION_URL:
      process.env.NEXT_PUBLIC_MYGOVID_END_SESSION_URL,
    NEXT_PUBLIC_FORMS_SERVICE_URL: process.env.NEXT_PUBLIC_FORMS_SERVICE_URL,
    NEXT_PUBLIC_ERROR_FORM_ID: process.env.NEXT_PUBLIC_ERROR_FORM_ID,
    NEXT_PUBLIC_UNLEASH_URL: process.env.NEXT_PUBLIC_UNLEASH_URL,
    NEXT_PUBLIC_UNLEASH_CLIENT_KEY: process.env.NEXT_PUBLIC_UNLEASH_CLIENT_KEY,
    NEXT_PUBLIC_UNLEASH_APP_NAME: process.env.NEXT_PUBLIC_UNLEASH_APP_NAME,
    NEXT_PUBLIC_ENABLE_DASHBOARD: process.env.NEXT_PUBLIC_ENABLE_DASHBOARD,
    NEXT_PUBLIC_ENABLE_MESSAGING: process.env.NEXT_PUBLIC_ENABLE_MESSAGING,
    NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION:
      process.env.NEXT_PUBLIC_ENABLE_JOURNEY_INTEGRATION,
    NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION:
      process.env.NEXT_PUBLIC_ENABLE_PAYMENTS_INTEGRATION,
    NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION:
      process.env.NEXT_PUBLIC_ENABLE_FORMS_INTEGRATION,
    NEXT_PUBLIC_ENABLE_LEA: process.env.NEXT_PUBLIC_ENABLE_LEA,
    NEXT_PUBLIC_ENABLE_FOLDERS: process.env.NEXT_PUBLIC_ENABLE_FOLDERS,
    NEXT_PUBLIC_ENABLE_MOCK_MESSAGES:
      process.env.NEXT_PUBLIC_ENABLE_MOCK_MESSAGES,
    NEXT_PUBLIC_ANALYTICS_URL: process.env.NEXT_PUBLIC_ANALYTICS_URL,
    NEXT_PUBLIC_MATOMO_URL: process.env.NEXT_PUBLIC_MATOMO_URL,
    NEXT_PUBLIC_MATOMO_PROTOCOL: process.env.NEXT_PUBLIC_MATOMO_PROTOCOL,
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
    NEXT_PUBLIC_FARO_REPLAY_ENABLED:
      process.env.NEXT_PUBLIC_FARO_REPLAY_ENABLED,
    NEXT_PUBLIC_FARO_REPLAY_SAMPLING_RATE:
      process.env.NEXT_PUBLIC_FARO_REPLAY_SAMPLING_RATE,
    NEXT_PUBLIC_VERSION: process.env.version,
  },
})
