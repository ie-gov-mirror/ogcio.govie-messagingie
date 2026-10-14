// This is required to collect http_server_* metrics when using nextjs node runtime

import { getEnvConfig } from "./utils/env"

export async function register() {
  const { OTEL_SERVER_SERVICE_NAME, OTEL_COLLECTOR_URL } = getEnvConfig()
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    OTEL_SERVER_SERVICE_NAME &&
    OTEL_COLLECTOR_URL
  ) {
    import("@ogcio/o11y-sdk-node").then(async (sdk) => {
      await sdk.instrumentNode({
        serviceName: OTEL_SERVER_SERVICE_NAME,
        collectorUrl: OTEL_COLLECTOR_URL,
        collectorMode: "batch",
        spanAttributes: {
          "signal.namespace": "messaging-support",
        },
      })
    })
  }
}
