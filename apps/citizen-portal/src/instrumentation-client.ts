import { type FaroSDKConfig, instrumentFaro } from "@ogcio/o11y-sdk-react"
import { env } from "@/env/env.client"
import { scrubPageUrlForObservability } from "@/util/scrub-page-url"

/**
 * Client instrumentation entry point (AB#40680).
 *
 * Next.js runs `instrumentation-client` **after the HTML is loaded but before
 * React hydration begins** — earlier than any component effect. Initialising
 * Faro here means its OpenTelemetry fetch instrumentation patches
 * `window.fetch` *before* the app fires its authenticated boot requests
 * (`/auth/status`, `/auth/health`, first inbox/data fetches), so those calls
 * get spans and `traceparent` propagation instead of being invisible to
 * tracing.
 *
 * Previously init ran from a component effect via `requestIdleCallback`, which
 * only fired once the boot fetches had already gone out with the native
 * `fetch` — leaving the boot path untraced. Session Replay (the heavy
 * per-interaction cost) is disabled on dev, so putting the far lighter base
 * SDK on the pre-hydration path is an acceptable trade for boot visibility.
 */

function buildFaroConfig(collectorUrl: string): FaroSDKConfig {
  return {
    serviceName: env.NEXT_PUBLIC_FARO_SERVICE_NAME,
    collectorUrl,
    corsTraceHeaders: env.NEXT_PUBLIC_FARO_PROPAGATE_TRACE_HEADER,
    collectorMode: "batch",
    appMeta: {
      name: env.NEXT_PUBLIC_FARO_SERVICE_NAME,
      namespace: env.NEXT_PUBLIC_FARO_SERVICE_NAMESPACE,
      version: env.NEXT_PUBLIC_VERSION,
    },
    pageUrlProcessor: scrubPageUrlForObservability,
  }
}

const collectorUrl = env.NEXT_PUBLIC_FARO_URL

if (collectorUrl) {
  try {
    if (env.NEXT_PUBLIC_FARO_REPLAY_ENABLED) {
      // Replay stays a lazy import so it is only pulled when enabled (never on
      // the dev fast path). It initialises a beat after the base SDK, which is
      // fine — replay does not need to wrap the very first fetches.
      void import("@ogcio/o11y-sdk-react/replay")
        .then(({ withReplay }) => {
          instrumentFaro(
            withReplay({
              ...buildFaroConfig(collectorUrl),
              replay: {
                enabled: true,
                samplingRate: env.NEXT_PUBLIC_FARO_REPLAY_SAMPLING_RATE,
              },
            }),
          )
        })
        // The surrounding try/catch only covers the synchronous setup.
        .catch((error: unknown) => {
          console.error("Faro replay failed to load", error)
        })
    } else {
      // Static import → `fetch` is patched synchronously here, before
      // hydration and therefore before the boot requests.
      instrumentFaro(buildFaroConfig(collectorUrl))
    }
  } catch (error) {
    // Never let instrumentation setup break app boot.
    console.error("Faro client instrumentation failed to initialise", error)
  }
}
