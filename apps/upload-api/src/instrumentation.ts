import { FastifyOtelInstrumentation } from "@fastify/otel";
import { instrumentNode, type SDKLogLevel } from "@ogcio/o11y-sdk-node";
import { captureServerSpan } from "./plugins/pseudo-user-traces-hook.js";

await instrumentNode({
  serviceName: process.env.OTEL_SERVER_SERVICE_NAME,
  collectorUrl: process.env.OTEL_COLLECTOR_URL as string,
  collectorMode: "batch",
  diagLogLevel: (process.env.OTEL_LOG_LEVEL as SDKLogLevel) ?? "ERROR",
  ignoreUrls: [
    { type: "equals", url: "/health" },
    { type: "equals", url: "/health/ready" },
    { type: "equals", url: "/health/startup" },
  ],
  additionalInstrumentations: [
    new FastifyOtelInstrumentation({
      registerOnInitialization: true,
      // Captures the server span for the pseudo-user traces hook.
      requestHook: captureServerSpan,
    }),
  ],
});
