import { getMetric } from "@ogcio/o11y-sdk-node";
import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import { getPendingJobPerOrganization } from "../services/jobs/job-service.js";
import type { MessageSentLabels } from "../types/message-sent.js";

/// Metric to track the number of messages sent, tagged by organization ID.
export const messagesSentCounter = getMetric<
  "counter",
  { organizationId: string }
>("counter", {
  meterName: "message_delivery",
  metricName: "messages_sent",
});

/// Emails accepted by the Email provider, per the o11y contract
/// bb.messaging.message.sent; labels come from messageSentLabels.
export const bbMessageSentCounter = getMetric<"counter", MessageSentLabels>(
  "counter",
  {
    meterName: "message_delivery",
    metricName: "bb.messaging.message.sent",
    options: { unit: "{message}" },
  },
);

/// Metric to track the number of messages read, tagged by organization ID.
export const messagesReadCounter = getMetric<
  "counter",
  { organizationId: string }
>("counter", {
  meterName: "message_delivery",
  metricName: "messages_read",
});

/// Metric to track the number of messages created, tagged by organization ID.
export const messagesCreatedCounter = getMetric<
  "counter",
  { organizationId: string }
>("counter", {
  meterName: "message_delivery",
  metricName: "messages_created",
});

export const messagesQueueGauge = getMetric<
  "gauge",
  { organizationId: string }
>("gauge", {
  meterName: "message_delivery",
  metricName: "messages_queued",
});

/// Metric to track the number of messages scheduled, tagged by organization ID.
export const messagesScheduledCounter = getMetric<
  "counter",
  { organizationId: string }
>("counter", {
  meterName: "message_delivery",
  metricName: "messages_scheduled",
});

/// Metric to track message lifecycle failures, tagged by organization ID and
/// pipeline stage. Stage is a fixed enum — never put error detail here
/// (details live in messaging_event_logs).
export const messagesFailedCounter = getMetric<
  "counter",
  { organizationId: string; stage: "schedule" | "deliver" | "email" }
>("counter", {
  meterName: "message_delivery",
  metricName: "messages_failed",
});

/// Histogram of seconds from message creation to successful delivery,
/// tagged by organization ID.
export const messageDeliveryDurationHistogram = getMetric<
  "histogram",
  { organizationId: string }
>("histogram", {
  meterName: "message_delivery",
  metricName: "message_delivery_duration",
  options: { unit: "s" },
});

/// Metric to track the number of messages queued, tagged by organization ID.
export const setupAsyncMetrics = (pool: Pool, logger: FastifyBaseLogger) => {
  // Gauge to track the number of messages currently queued, tagged by organization ID.
  getMetric<"async-gauge", { organizationId: string }>("async-gauge", {
    metricName: "messages_queued",
    meterName: "message_delivery",
  }).addCallback(async (observer) => {
    const pendingJobs = await getPendingJobPerOrganization({
      pool,
      logger,
    });
    pendingJobs.forEach((job) => {
      observer.observe(job.counter, {
        organizationId: job.organizationId,
      });
    });
  });
};
