import { isNativeError } from "node:util/types";
import type NodeCache from "@cacheable/node-cache";
import { httpErrors } from "@fastify/sensible";
import {
  type LoggingError,
  toLoggingError,
} from "@ogcio/fastify-logging-wrapper";
import { getErrorMessage } from "@ogcio/shared-errors";
import type { FastifyBaseLogger } from "fastify";
import { isHttpError } from "http-errors";
import type { Pool, PoolClient } from "pg";
import type { EnvConfig } from "../../plugins/external/env.js";
import { JobTypes } from "../../types/jobs.js";
import type {
  MessageToDeliver,
  MessageToDeliverWoAttachments,
} from "../../types/messages.js";
import type {
  EmailProvider,
  ProviderAcceptance,
} from "../../types/providers.js";
import CryptographyService from "../../utils/cryptography-service.js";
import type { I18n } from "../../utils/i18n.js";
import {
  messageDeliveryDurationHistogram,
  messagesFailedCounter,
  messagesSentCounter,
} from "../../utils/metrics.js";
import type { ServiceError } from "../../utils/utils.js";
import {
  type EventType,
  type MessageEventData,
  type MessagingEventLogger,
  MessagingEventType,
} from "../messages/event-logger.js";
import { EmailSpecificProvider } from "../providers/email/email-specific-provider.js";
import { EmailSpecificTransport } from "../providers/email/email-specific-transport.js";
import { ProfileM2MSdkWrapper } from "../users/profile-m2m-sdk-wrapper.js";
import type {
  GetOrganisationResponse,
  GetProfileResponse,
  ProfileSdkWrapper,
} from "../users/profile-sdk-wrapper.js";
import { AvailableTransports } from "../users/shared-users.js";
import { prepareForSecureDelivery } from "./secure-message-processor.js";

export type ScheduledMessageStatus =
  | "pending"
  | "working"
  | "failed"
  | "delivered";
export const JobStatus = {
  Working: "working",
  Pending: "pending",
  Failed: "failed",
  Delivered: "delivered",
};

export type RunningJob = {
  jobId: string;
  userId: string;
  type: string;
  status: ScheduledMessageStatus;
  organizationId: string;
};

// Whether an earlier run already delivered the message to the Inbox
enum InboxState {
  Undelivered = "undelivered",
  Delivered = "delivered",
}

// A claimed job, with the Inbox state its failures depend on
type ClaimedJob = RunningJob & { inbox: InboxState };

export type PendingJobCounter = {
  organizationId: string;
  counter: number;
};

export const executeJob = async (params: {
  config: EnvConfig;
  pool: Pool;
  logger: FastifyBaseLogger;
  jobId: string;
  token: string;
  eventLogger: MessagingEventLogger;
  i18n: I18n;
  // biome-ignore lint/suspicious/noExplicitAny: insert any type
  cache: NodeCache<any>;
}): Promise<void> => {
  const job = await setJobAsRunning({
    eventLogger: params.eventLogger,
    pool: params.pool,
    job: { id: params.jobId, token: params.token },
  });
  switch (job.type) {
    case JobTypes.Message:
      await processMessageJob({
        config: params.config,
        job,
        eventLogger: params.eventLogger,
        pool: params.pool,
        logger: params.logger,
        i18n: params.i18n,
        cache: params.cache,
      });
      break;
    default:
      params.logger.warn(job, "Job has unrecognized type");
      await failJob(params.pool, params.jobId);
  }
};

async function setJobAsRunning(params: {
  eventLogger: MessagingEventLogger;
  pool: Pool;
  job: { id: string; token: string };
}): Promise<ClaimedJob> {
  const { pool, job, eventLogger } = params;
  let runningJob: RunningJob | undefined;
  let jobResult:
    | {
        status: ScheduledMessageStatus;
        entityId: string;
        organizationId: string;
        inboxDelivered: boolean;
      }
    | undefined;
  // Set once pending is logged; only a claimed message gets a failure event
  let claimedMessageId: string | undefined;
  let inbox = InboxState.Undelivered;
  try {
    const jobStatusResult = await pool.query<{
      status: ScheduledMessageStatus;
      entityId: string;
      organizationId: string;
      inboxDelivered: boolean;
    }>(
      `
        SELECT
          coalesce(delivery_status, 'pending') as "status",
          job_id as "entityId",
          organisation_id as "organizationId",
          coalesce(
            (SELECT is_delivered FROM messages WHERE messages.id = jobs.job_id),
            false
          ) as "inboxDelivered"
        FROM jobs WHERE id = $1
        AND case when delivery_status is not null then delivery_status != $2 else true end
        AND job_token = $3
    `,
      [job.id, JobStatus.Delivered, job.token],
    );

    jobResult = jobStatusResult.rows.at(0);

    if (!jobResult) {
      throw httpErrors.notFound("job doesn't exist");
    }

    if (jobResult.status === JobStatus.Working) {
      throw httpErrors.badRequest("job is already in progress");
    }

    if (jobResult.inboxDelivered) {
      inbox = InboxState.Delivered;
    }

    eventLogger.log(
      MessagingEventType.deliverMessagePending,
      { messageId: jobResult.entityId }, // job id error field?
    );
    claimedMessageId = jobResult.entityId;

    const updateResult = await pool.query<RunningJob>(
      `
        UPDATE jobs SET delivery_status = $1
        WHERE id = $2
        returning 
        user_id as "userId",
        job_type as "type",
        job_id as "jobId",
        organisation_id as "organizationId",
        delivery_status as "status"
    `,
      [JobStatus.Working, job.id],
    );

    runningJob = updateResult.rows.at(0);
    if (!runningJob) {
      throw httpErrors.notFound("Not able to find job to update");
    }
  } catch (err) {
    // Unknown, duplicate or wrong-token callbacks leave no event and no count
    if (claimedMessageId) {
      logClaimFailure({
        eventLogger,
        messageId: claimedMessageId,
        messageKey: "jobClaimError",
        inbox,
        organizationId: jobResult?.organizationId,
      });
    }

    if (isHttpError(err)) {
      throw err;
    }

    throw httpErrors.createError(500, "Failed fetching/updating job", {
      parent: err,
    });
  }

  if (!runningJob.userId || !runningJob.type) {
    logClaimFailure({
      eventLogger,
      messageId: runningJob.jobId,
      messageKey: "jobMissingFields",
      inbox,
      organizationId: runningJob.organizationId,
    });
    await failJob(pool, job.id);
    throw httpErrors.internalServerError(
      `job row with id ${runningJob.jobId} missing critical fields`,
    );
  }

  return { ...runningJob, inbox };
}

// Ends a job the delivery cannot run; left working, every retry is refused
async function failJob(pool: Pool, jobId: string) {
  await pool.query("UPDATE jobs SET delivery_status = $1 WHERE id = $2", [
    JobStatus.Failed,
    jobId,
  ]);
}

// Logs and counts a failure of the claimed message
function logClaimFailure(params: {
  eventLogger: MessagingEventLogger;
  messageId: string;
  messageKey: string;
  inbox: InboxState;
  organizationId?: string;
}) {
  const type = failureType(params.inbox);
  params.eventLogger.log(type, {
    messageId: params.messageId,
    messageKey: params.messageKey,
  });
  messagesFailedCounter.add(1, {
    organizationId: params.organizationId ?? "unknown",
    stage: failedStage(type),
  });
}

// A failure before the email fails the Inbox delivery, unless an earlier run
// made it: the message stays readable, so only the email is left to fail
function failureType(inbox: InboxState): EventType {
  if (inbox === InboxState.Delivered) {
    return MessagingEventType.emailError;
  }

  return MessagingEventType.deliverMessageError;
}

// messages_failed stage of a failure event, e.g. "email" for email_delivery
function failedStage(type: EventType) {
  return type === MessagingEventType.emailError ? "email" : "deliver";
}

async function processMessageJob(params: {
  config: EnvConfig;
  job: ClaimedJob;
  eventLogger: MessagingEventLogger;
  pool: Pool;
  logger: FastifyBaseLogger;
  i18n: I18n;
  // biome-ignore lint/suspicious/noExplicitAny: insert any type
  cache: NodeCache<any>;
}) {
  const { job, eventLogger, pool, logger, i18n, config, cache } = params;
  let profileWrapper: ProfileSdkWrapper | null = null;
  let profile: GetProfileResponse | null = null;
  let deliveryError: LoggingError | undefined;
  let eventToLogData: MessageEventData | undefined;
  try {
    profileWrapper = new ProfileM2MSdkWrapper(logger, job.organizationId);
  } catch (e) {
    const msg = isNativeError(e)
      ? e.message
      : "failed to initialize profile SDK";
    deliveryError = toLoggingError(httpErrors.internalServerError(msg));
    logger.error({ error: deliveryError.parent }, deliveryError.message);
    eventToLogData = {
      messageId: job.jobId,
      details: msg,
      messageKey: "sdkInitError",
    };
  }

  if (!profileWrapper) {
    const eventToLog = eventToLogData
      ? {
          type: failureType(job.inbox),
          eventData: eventToLogData,
        }
      : undefined;
    return updateJobStatus({ ...params, deliveryError, eventToLog });
  }

  try {
    profile = await profileWrapper.getProfile(job.userId);
  } catch (e) {
    const msg = isNativeError(e) ? e.message : "failed to retrieve profile";
    deliveryError = toLoggingError(httpErrors.internalServerError(msg));
    logger.error({ error: deliveryError.parent }, deliveryError.message);
    eventToLogData = {
      messageId: job.jobId,
      details: msg,
      messageKey: profileFailureKey(e),
    };
  }

  if (!profile) {
    const eventToLog = eventToLogData
      ? {
          type: failureType(job.inbox),
          eventData: eventToLogData,
        }
      : undefined;
    return updateJobStatus({ ...params, deliveryError, eventToLog });
  }

  const inboxResult = await deliverToInbox({
    pool,
    eventLogger,
    logger,
    messageId: job.jobId,
    inbox: job.inbox,
  });
  if (inboxResult.error) {
    return updateJobStatus({
      ...params,
      deliveryError: inboxResult.error,
      eventToLog: inboxResult.eventToLog,
    });
  }

  const deliveryResult = await deliverMessage({
    pool,
    eventLogger,
    organizationId: job.organizationId,
    messageId: job.jobId,
    logger,
    i18n,
    config,
    profile,
    profileWrapper,
    cache,
  });

  // Commented out SMS delivery for now
  // new SmsSender({
  //   profile,
  //   organizationId: job.organizationId,
  //   logger,
  //   config,
  //   getTransport: () => new SnsSmsTransport({ config, logger }),
  //   i18n,
  //   organisation,
  // }).send();
  return updateJobStatus({
    ...params,
    deliveryError: deliveryResult.error,
    eventToLog: deliveryResult.eventToLog,
  });
}

const HTTP_NOT_FOUND = 404;

// Tells a recipient who no longer exists from an unavailable profile service
function profileFailureKey(error: unknown): string {
  if (isHttpError(error) && error.statusCode === HTTP_NOT_FOUND) {
    return "profileNotFound";
  }

  return "profileFetchError";
}

// Marks the message readable in the Inbox; logs it only on the first delivery
async function deliverToInbox(params: {
  pool: Pool;
  eventLogger: MessagingEventLogger;
  logger: FastifyBaseLogger;
  messageId: string;
  inbox: InboxState;
}): Promise<{
  error?: LoggingError;
  eventToLog?: { type: EventType; eventData: MessageEventData };
}> {
  const { pool, eventLogger, logger, messageId, inbox } = params;
  let rowCount: number | null;
  try {
    ({ rowCount } = await pool.query(
      `
      UPDATE messages SET
        is_delivered = true,
        updated_at = now()
      WHERE id = $1 AND is_delivered = false
    `,
      [messageId],
    ));
  } catch (err) {
    // Fail the job rather than leave it working, so a retry can deliver it
    logger.error({ error: err }, "Inbox delivery error");
    return {
      error: toLoggingError(
        httpErrors.internalServerError("Error delivering to inbox"),
      ),
      eventToLog: {
        type: failureType(inbox),
        eventData: {
          messageId,
          details: getErrorMessage(err),
          messageKey: "inboxDeliveryError",
        },
      },
    };
  }

  // No row changed: already delivered by an earlier run, or no such message
  if (!rowCount) {
    return {};
  }

  eventLogger.log(MessagingEventType.deliverMessage, { messageId });

  return {};
}

async function deliverMessage(params: {
  pool: Pool;
  messageId: string;
  eventLogger: MessagingEventLogger;
  organizationId: string;
  logger: FastifyBaseLogger;
  i18n: I18n;
  config: EnvConfig;
  profile: GetProfileResponse;
  profileWrapper: ProfileSdkWrapper;
  // biome-ignore lint/suspicious/noExplicitAny: insert any type
  cache: NodeCache<any>;
}): Promise<{
  error?: LoggingError;
  eventToLog?: { type: EventType; eventData: MessageEventData };
}> {
  let _err: unknown;
  const { messageId, pool, logger, profile } = params;
  let messageData: MessageToDeliver | undefined;
  try {
    messageData = await getMessageToDeliver({
      messageId,
      recipientUserId: profile.id,
      client: pool,
    });
  } catch (messageErr) {
    logger.error({ error: messageErr }, "Get message to deliver error");
    _err = messageErr;
  }

  if (!messageData) {
    return {
      error: toLoggingError(
        httpErrors.createError(500, "Error retrieving message", {
          parent: _err,
        }),
      ),
      eventToLog: {
        type: MessagingEventType.emailError,
        eventData: {
          messageId,
          details: isNativeError(_err) ? _err.message : "unknown error",
          messageKey: "messageFetchError",
        },
      },
    };
  }

  try {
    const transportResult = await sendMessageToTransports({
      ...params,
      messageData,
    });

    for (const err of transportResult.errors) {
      logger.error({ error: err.error }, err.msg);
    }

    const firstError = transportResult.errors
      .filter((err) => err.critical)
      .at(0);
    let loggingError: LoggingError | undefined;
    if (firstError) {
      loggingError = toLoggingError(
        httpErrors.internalServerError(firstError.msg),
      );
    }
    // The Inbox delivery is already logged; the email outcome is the only one left
    return {
      error: loggingError,
      eventToLog: transportResult.eventToLog,
    };
  } catch (err) {
    logger.error({ error: err }, "Deliver message error");
    _err = err;
  }

  if (_err)
    return {
      error: toLoggingError(
        httpErrors.createError(500, "Error sending message", { parent: _err }),
      ),
      // Runs after the Inbox delivery, so only the email can have failed
      eventToLog: {
        type: MessagingEventType.emailError,
        eventData: {
          messageId,
          details: isNativeError(_err) ? _err.message : "unknown error",
          messageKey: "deliverMessageError",
        },
      },
    };

  return {};
}

async function getMessageToDeliver(params: {
  messageId: string;
  recipientUserId: string;
  client: PoolClient | Pool;
}): Promise<MessageToDeliver> {
  const { messageId, client } = params;
  const messageUpdateQueryResult = await client.query<
    MessageToDeliverWoAttachments & {
      attachmentId?: string;
    }
  >(
    `
    SELECT 
    m.id,
    m.preferred_transports AS "transports",
    m.excerpt,
    m.subject,
    m.security_level as "securityLevel",
    m.plain_text as "body",
    m.rich_text as "richText",
    aid.attachment_id AS "attachmentId",
    m.external_id as "externalId",
    m.created_at as "createdAt"
    FROM messages m
    LEFT JOIN (
        SELECT attachment_id, message_id 
        FROM attachments_messages
    ) aid
    ON m.id = aid.message_id
    WHERE m.id = $1;
  `,
    [messageId],
  );
  let messageData: MessageToDeliver | undefined;
  const attachmentIds = [];
  for (const row of messageUpdateQueryResult.rows) {
    if (row.attachmentId) {
      attachmentIds.push(row.attachmentId);
    }
    if (!messageData) {
      messageData = {
        body: row.body,
        excerpt: row.excerpt || undefined,
        subject: row.subject,
        transports: row.transports ? row.transports : undefined,
        attachmentIds: undefined,
        securityLevel: row.securityLevel,
        id: row.id,
        richText: row.richText || undefined,
        externalId: row.externalId || undefined,
        createdAt: row.createdAt || undefined,
      };
    }
  }

  if (!messageData) {
    throw httpErrors.notFound(`failed to find message for id ${messageId}`);
  }
  messageData.attachmentIds =
    attachmentIds.length > 0 ? attachmentIds : undefined;

  return messageData;
}

async function updateJobStatus(params: {
  deliveryError: LoggingError | undefined;
  pool: Pool;
  job: { jobId: string; userId: string; organizationId?: string };
  eventLogger: MessagingEventLogger;
  eventToLog?: { type: EventType; eventData: MessageEventData };
}): Promise<void> {
  const { pool, deliveryError, job } = params;

  // is_delivered is set at the Inbox delivery; only the job status is left
  await pool.query(
    `
        UPDATE jobs SET delivery_status = $1
        WHERE job_id = $2 AND user_id = $3
      `,
    [
      deliveryError ? JobStatus.Failed : JobStatus.Delivered,
      job.jobId,
      job.userId,
    ],
  );

  if (params.eventToLog) {
    params.eventLogger.log(params.eventToLog.type, params.eventToLog.eventData);
    if (
      params.eventToLog.type === MessagingEventType.deliverMessageError ||
      params.eventToLog.type === MessagingEventType.emailError
    ) {
      messagesFailedCounter.add(1, {
        organizationId: params.job.organizationId ?? "unknown",
        stage: failedStage(params.eventToLog.type),
      });
    }
  }
}

async function sendMessageToTransports(params: {
  pool: Pool;
  organizationId: string;
  messageId: string;
  messageData: MessageToDeliver;
  eventLogger: MessagingEventLogger;
  logger: FastifyBaseLogger;
  i18n: I18n;
  config: EnvConfig;
  profile: GetProfileResponse;
  profileWrapper: ProfileSdkWrapper;
  // biome-ignore lint/suspicious/noExplicitAny: insert any type
  cache: NodeCache<any>;
}): Promise<{
  errors: ServiceError[];
  eventToLog?: { type: EventType; eventData: MessageEventData };
}> {
  // if the only selected transport is life event or no transports are set, we are okay
  const onlyEditableTransports =
    params.messageData.transports?.filter(
      (t) => t !== AvailableTransports.LIFE_EVENT,
    ) ?? [];

  if (!onlyEditableTransports.length) {
    return { errors: [] };
  }

  // At the moment we only manage email as transport
  if (!onlyEditableTransports.includes(AvailableTransports.EMAIL)) {
    return { errors: [] };
  }

  const criticalError = {
    critical: true,
    msg: "Not been able to send to any transport",
    error: httpErrors.badGateway("Message has not been sent anywhere"),
  };

  // A step's error fails the email; the critical error then fails the job
  const emailFailure = (
    cause: ServiceError,
    messageKey: string,
    details?: string,
  ) => ({
    errors: [cause, criticalError],
    eventToLog: {
      type: MessagingEventType.emailError,
      eventData: { messageId: params.messageId, messageKey, details },
    },
  });

  // Only the email needs the organisation, so a lookup failure stops the email alone
  const organisation = await getOrganisation(params);
  if (organisation.error) {
    return emailFailure(
      organisation.error,
      "organisationFetchError",
      organisation.error.msg,
    );
  }

  const secureMessage = getSecureMessage({
    ...params,
    organisation: organisation.data,
  });
  if (secureMessage.error) {
    return emailFailure(
      secureMessage.error,
      "secureMessagePreparationError",
      secureMessage.error.msg,
    );
  }

  const provider = await getProvider(params);
  if (!provider) {
    return {
      errors: [criticalError],
      eventToLog: {
        type: MessagingEventType.emailError,
        eventData: {
          messageId: params.messageId,
          messageKey: "noProvider",
          details: "No provider found for organisation",
        },
      },
    };
  }

  const sentResult = await sendEmail({
    ...params,
    provider,
    secureMessage: secureMessage.secureMessage,
  });
  if (!sentResult.sent) {
    if (sentResult.error) {
      return emailFailure(
        sentResult.error,
        "failedToSend",
        sentResult.error.details,
      );
    }
    return { errors: [criticalError], eventToLog: sentResult.eventToLog };
  }

  recordSentEmail(params);

  // Logged last, so the accepted email is the message's latest event
  return {
    errors: [],
    eventToLog: {
      type: MessagingEventType.emailAccepted,
      eventData: { messageId: params.messageId, ...sentResult.acceptance },
    },
  };
}

// Counts an accepted email; a metrics error must not undo the acceptance
function recordSentEmail(params: {
  organizationId: string;
  messageData: MessageToDeliver;
  logger: FastifyBaseLogger;
}) {
  try {
    messagesSentCounter.add(1, {
      organizationId: params.organizationId,
    });
    if (params.messageData.createdAt) {
      const seconds =
        (Date.now() - new Date(params.messageData.createdAt).getTime()) / 1000;
      // guard: never record garbage from an unparsable timestamp
      if (Number.isFinite(seconds) && seconds >= 0) {
        messageDeliveryDurationHistogram.record(seconds, {
          organizationId: params.organizationId,
        });
      }
    }
  } catch (err) {
    params.logger.error({ error: err }, "Failed to record sent email");
  }
}

// Looks up the sender organisation; its names go into the secure email
async function getOrganisation(params: {
  profileWrapper: ProfileSdkWrapper;
  organizationId: string;
  // biome-ignore lint/suspicious/noExplicitAny: insert any type
  cache: NodeCache<any>;
  logger: FastifyBaseLogger;
}): Promise<
  | { data: NonNullable<GetOrganisationResponse>["data"]; error?: undefined }
  | { data?: undefined; error: ServiceError }
> {
  try {
    return {
      data: await params.profileWrapper.getOrganisationWithCache(
        params.organizationId,
        params.cache,
        params.logger,
      ),
    };
  } catch (error) {
    return {
      error: {
        critical: false,
        error: { error },
        msg: isNativeError(error)
          ? error.message
          : "failed to retrieve organisation",
      },
    };
  }
}

function getSecureMessage(params: {
  profile: GetProfileResponse;
  i18n: I18n;
  organisation: NonNullable<GetOrganisationResponse>["data"];
  messageData: MessageToDeliver;
  logger: FastifyBaseLogger;
}):
  | {
      secureMessage: MessageToDeliver & { transports: string[] };
      error?: undefined;
    }
  | { secureMessage?: undefined; error: ServiceError } {
  try {
    return {
      secureMessage: prepareForSecureDelivery({
        ...params,
        messageToDeliver: params.messageData,
      }),
    };
  } catch (error) {
    params.logger.error({ error }, "Failed to prepare secure message");
    return {
      error: {
        critical: false,
        error: { error },
        msg: isNativeError(error)
          ? error.message
          : "failed to externally transport message",
      },
    };
  }
}

async function getProvider({
  organizationId,
  pool,
  logger,
  config,
}: {
  organizationId: string;
  pool: Pool;
  logger: FastifyBaseLogger;
  config: EnvConfig;
}): Promise<EmailProvider | null> {
  try {
    const providerClient = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService(config),
      config,
      logger,
    );
    const provider = await providerClient.getPrimaryOrDefault();

    if (!provider) {
      logger.warn(
        { transport: "email" },
        `No primary provider found for organisation ${organizationId}, using default provider`,
      );

      return null;
    }

    return provider;
  } catch (_e) {
    logger.warn(
      { transport: "email" },
      `No primary provider found for organisation ${organizationId}`,
    );

    return null;
  }
}

async function sendEmail({
  provider,
  secureMessage,
  profile,
  messageId,
  logger,
}: {
  provider: EmailProvider;
  secureMessage: MessageToDeliver;
  profile: GetProfileResponse;
  messageId: string;
  logger: FastifyBaseLogger;
}): Promise<{
  sent: boolean;
  error: ServiceError | null;
  eventToLog?: { type: EventType; eventData: MessageEventData };
  acceptance?: ProviderAcceptance;
}> {
  try {
    const specificTransport = new EmailSpecificTransport(provider);
    const canBeSentResult = await specificTransport.checkIfMessageCanBeSent({
      message: secureMessage,
      userAddress: profile.email,
    });
    if (!canBeSentResult.canBeSent) {
      return {
        sent: false,
        error: null,
        eventToLog: canBeSentResult.eventToLog,
      };
    }

    const acceptance = await specificTransport.sendMessage({
      message: secureMessage,
      recipientAddress: profile.email,
    });

    return { sent: true, error: null, acceptance };
  } catch (err) {
    logger.error({ error: err }, "Failed to send message");

    return {
      sent: false,
      error: {
        critical: false,
        error: {
          userId: profile.id,
          providerId: provider.id,
          messageId,
        },
        details: JSON.stringify(err),
        msg: "failed to send email",
      },
    };
  }
}

export async function getPendingJobPerOrganization(params: {
  pool: Pool;
  logger: FastifyBaseLogger;
}): Promise<PendingJobCounter[]> {
  const { pool, logger } = params;
  try {
    const pendingJobResult = await pool.query<{
      counter: number;
      organizationId: string;
    }>(
      `
        SELECT
          count(*) as counter,
          organisation_id as "organizationId"
        FROM jobs
        WHERE delivery_status = $1
        GROUP BY organisation_id
    `,
      [JobStatus.Pending],
    );

    // SQL returns count as string, we need to convert it to number
    return pendingJobResult.rows.map((row) => ({
      counter: Number(row.counter),
      organizationId: row.organizationId,
    }));
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    if (isHttpError(err)) {
      logger.error(
        { error: errorMessage, statusCode: err.statusCode },
        "HTTP error fetching pending jobs",
      );
    }
    logger.error({ error: errorMessage }, "Error fetching pending jobs");
  }

  return [];
}
