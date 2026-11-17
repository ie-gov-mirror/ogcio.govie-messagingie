import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants"
import type { LoggingConfig } from "next/dist/server/config-shared"
import createNextIntlPlugin from "next-intl/plugin"
import { env } from "@/env/env.client"

const { version } = require("./package.json")

const withNextIntl = createNextIntlPlugin()

/**
 * Conditionally applies the bundle analyzer when ANALYZE=true.
 *
 * Uses require() instead of a static import because the monorepo has both
 * next@14 and next@16 installed, and @next/bundle-analyzer's static types
 * resolve against the wrong next installation, creating an incompatible
 * NextConfig type at the TypeScript level. At runtime, the analyzer simply
 * injects a webpack plugin and passes the config through unchanged.
 */
function withBundleAnalyzerIfEnabled(config: NextConfig): NextConfig {
  if (process.env.ANALYZE !== "true") return config
  const createAnalyzer: (opts: {
    enabled: boolean
  }) => (config: NextConfig) => NextConfig = require("@next/bundle-analyzer")
  return createAnalyzer({ enabled: true })(config)
}

const nextConfig: NextConfig = {
  output: "export",
  // Overridden only by the flags e2e server, so it runs next to `next dev`;
  // unset keeps Next's default
  distDir: process.env.CITIZEN_PORTAL_DIST_DIR || undefined,
  // LEA-only routes (discovery) are `page.lea.tsx`: they are not routes at
  // all unless the flag is on, so a flag-off export has no trace of them.
  pageExtensions: [
    ...(env.NEXT_PUBLIC_ENABLE_LEA ? ["lea.tsx"] : []),
    "tsx",
    "ts",
    "jsx",
    "js",
  ],
  allowedDevOrigins: [
    "messaging.local.test",
    "profile.local.test",
    "dashboard.local.test",
  ],
  images: {
    unoptimized: true,
  },
  env: {
    version: version || "0.0.0",
  },
  poweredByHeader: false,
  reactStrictMode: false,
  cacheComponents: false,
  // Transpile packages that export raw TypeScript source — the workspace
  // `@citizen-portal/shared` package plus the @ogcio/* packages the zones
  // pull in directly. As the messages / profile / dashboard zones fold into
  // this app in Phase B, additional transpile targets may be added here.
  transpilePackages: [
    "@citizen-portal/shared",
    "@ogcio/sag-client",
    "@ogcio/nextjs-analytics",
    "@ogcio/analytics-sdk",
  ],
  experimental: {
    optimizePackageImports: ["@ogcio/design-system-react", "next-intl"],
  },
  logging: {
    fetches: {
      fullUrl: true,
      hmrRefreshes: true,
    },
    incomingRequests: true,
  } satisfies LoggingConfig,
}

/**
 * Dev-only proxy for the Matomo analytics management API. Mirrors the rewrite
 * the messages zone ships today so we don't have CORS friction when the unified
 * app starts pulling the analytics website config from the API.
 */
function withAnalyticsApiDevProxy(
  config: NextConfig,
  phase: string,
): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) {
    return config
  }
  return {
    ...config,
    async rewrites() {
      return [
        {
          source: "/_next/analytics-api/:path*",
          destination: `${process.env.ANALYTICS_MANAGEMENT_API_ORIGIN ?? "https://api.analytics.dev.services.gov.ie"}/:path*`,
        },
      ]
    },
  }
}

/** Gateway app for attachment downloads; matches nginx's `X-Application`. */
const FILES_SAG_APP = "messaging"
const FILES_SOURCE = "/_next/files/:path*"
/** Local gateway, used when `NEXT_PUBLIC_SAG_URL` is unset. */
const DEFAULT_SAG_URL = "http://localhost:3333"

type Rewrite = { source: string; destination: string }

/**
 * Dev-only stand-in for nginx's `/_next/files/` gateway proxy (see
 * docker/nginx.conf.template), which `next dev` lacks. Rewrites cannot set
 * request headers, so the app goes as `?app=`, which the gateway accepts in
 * place of `X-Application`. Cookies and the response stream pass through.
 * nginx's sandbox CSP and nosniff are not replicated: Next drops custom
 * headers on proxied responses.
 */
function withFilesDevProxy(config: NextConfig, phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) {
    return config
  }

  const sagUrl = (process.env.NEXT_PUBLIC_SAG_URL ?? DEFAULT_SAG_URL).replace(
    /\/$/,
    "",
  )
  const { rewrites } = config

  return {
    ...config,
    async rewrites() {
      // The analytics dev proxy, the only earlier rewrite, returns a list
      const previous = (rewrites ? await rewrites() : []) as Rewrite[]
      const filesRewrite = {
        source: FILES_SOURCE,
        destination: `${sagUrl}/:path*?app=${FILES_SAG_APP}`,
      }

      return [...previous, filesRewrite]
    },
  }
}

/**
 * Legacy email links use `/[locale]/secure-messages/<messageId>`; the app
 * page reads `?id=`. Production handles this in nginx (see
 * docker/nginx.conf.template); dev applies the same redirect here because
 * static export does not emit redirect files.
 */
function withSecureMessagesLegacyRedirect(config: NextConfig): NextConfig {
  return {
    ...config,
    async redirects() {
      return [
        {
          source: "/:locale/secure-messages/:messageId",
          destination: "/:locale/secure-messages?id=:messageId",
          permanent: false,
        },
      ]
    },
  }
}

/**
 * The submissions route was renamed `/[locale]/my-applications` →
 * `/[locale]/my-submissions` (AB#41485). Existing deep links (e.g. the
 * `?id=` submission links from the message view) must keep working, so the
 * old path 302s to the new one. Production handles this in nginx (see
 * docker/nginx.conf.template); dev applies the same redirect here because
 * static export does not emit redirect files. Query strings (`?id=…`) are
 * forwarded automatically by Next.js.
 */
function withApplicationsToSubmissionsRedirect(config: NextConfig): NextConfig {
  const existing = config.redirects
  return {
    ...config,
    async redirects() {
      const previous = existing ? await existing() : []
      return [
        ...previous,
        {
          source: "/:locale/my-applications",
          destination: "/:locale/my-submissions",
          permanent: false,
        },
      ]
    },
  }
}

export default function citizenPortalConfig(phase: string): NextConfig {
  return withBundleAnalyzerIfEnabled(
    withNextIntl(
      withApplicationsToSubmissionsRedirect(
        withSecureMessagesLegacyRedirect(
          withFilesDevProxy(withAnalyticsApiDevProxy(nextConfig, phase), phase),
        ),
      ),
    ),
  )
}
