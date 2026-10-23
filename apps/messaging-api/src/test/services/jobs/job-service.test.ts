import { randomBytes, randomUUID } from "node:crypto";
import { NodeCache } from "@cacheable/node-cache";
import type { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { EnvConfig } from "../../../plugins/external/env.js";
import {
  executeJob,
  getPendingJobPerOrganization,
  JobStatus,
} from "../../../services/jobs/job-service.js";
import { listMessageEvents } from "../../../services/message-events/message-event-service.js";
import {
  MessagingEventLogger,
  MessagingEventType,
} from "../../../services/messages/event-logger.js";
import { EmailSpecificProvider } from "../../../services/providers/email/email-specific-provider.js";
import { AvailableTransports } from "../../../services/users/shared-users.js";
import { ProviderTypes } from "../../../types/providers.js";
import CryptographyService from "../../../utils/cryptography-service.js";
import { Translator } from "../../../utils/i18n.js";
import {
  messageDeliveryDurationHistogram,
  messagesFailedCounter,
  messagesSentCounter,
} from "../../../utils/metrics.js";
import {
  DATABASE_TEST_URL_KEY,
  getPoolFromConnectionString,
} from "../../build-testcontainer-pg.js";
import { getMockBaseLogger } from "../../test-server-builder.js";
import {
  deleteJobsAndRelatedForOrganization,
  getJob,
  getMessage,
  insertMockJob,
  insertMockMessage,
} from "./job-service-utils.js";

vi.mock("../../../utils/metrics.js", () => ({
  messagesSentCounter: { add: vi.fn() },
  messagesReadCounter: { add: vi.fn() },
  messagesCreatedCounter: { add: vi.fn() },
  messagesQueueGauge: { record: vi.fn() },
  messagesScheduledCounter: { add: vi.fn() },
  messagesFailedCounter: { add: vi.fn() },
  messageDeliveryDurationHistogram: { record: vi.fn() },
  setupAsyncMetrics: vi.fn(),
}));

const organizationId = "job-service-org";
const mockLogger = getMockBaseLogger();
let pool: Pool;
let eventLogger: MessagingEventLogger;
// biome-ignore lint/suspicious/noExplicitAny: insert any type
let cache: NodeCache<any>;

const hoisted = vi.hoisted(() => {
  // HTTP statuses the profile lookup fails with
  const profileStatus = { notFound: 404, unavailable: 503 };

  // SES accepts an email with "250 Ok <message ID>"
  const sesMessageId =
    "0100018f2b3c4d5e-6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c-000000";
  const sesAcceptance = `250 Ok ${sesMessageId}`;

  const state = {
    mustEmailSendingFail: false,
    sentEmails: [] as { html: string; text: string; subject: string }[],
    doesProfileExist: true,
    profileErrorStatus: profileStatus.unavailable,
    canBuildProfileClient: true,
    hasProfileValidEmail: true,
    preferredLanguage: "en",
    smtpResponse: sesAcceptance,
  };

  const organizationNotExistId = "non-existent-org";

  // SMTP fields nodemailer sets on a rejected email
  const smtpRejection = {
    code: "EMESSAGE",
    command: "DATA",
    response: "554 Message rejected: Email address is not verified.",
    responseCode: 554,
  };

  const getMockProfile = (profileId: string) => ({
    id: profileId,
    publicName: "Mock Public Name",
    email: "e@mail.com",
    primaryUserId: profileId,
    safeLevel: 0,
    preferredLanguage: state.preferredLanguage,
    createdAt: new Date(new Date().toUTCString()).toISOString(),
    updatedAt: new Date(new Date().toUTCString()).toISOString(),
    details: {
      email: "e@mail.com",
      firstName: "Name",
      lastName: "Surname",
      phone: "1234567890",
      address: "123 Main St",
    },
    linkedProfiles: [],
  });

  const getMockOrganisation = (orgId: string) => ({
    id: orgId,
    translations: {
      en: {
        name: "EN Mock Organisation",
        shortName: "EN Mock Org",
      },
      ga: {
        name: "GA Mock Organisation",
        shortName: "GA Mock Org",
      },
    },
  });

  const createHttpError = (statusCode: number, message: string) => {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  };

  return {
    sesMessageId,
    sesAcceptance,
    state,
    profileStatus,
    organizationNotExistId,
    smtpRejection,
    getMockProfile,
    getMockOrganisation,
    createHttpError,
  };
});

vi.mock("nodemailer", () => ({
  createTransport: vi.fn((_transport: unknown) => {
    return {
      sendMail: (toSend: { html: string; text: string; subject: string }) => {
        if (hoisted.state.mustEmailSendingFail) {
          throw Object.assign(
            new Error("Mail sending failed"),
            hoisted.smtpRejection,
          );
        }
        hoisted.state.sentEmails.push(toSend);

        return { response: hoisted.state.smtpResponse };
      },
    };
  }),
}));

vi.mock("../../../services/users/profile-sdk-wrapper.js", async () => {
  // The real wrapper raises these HTTP errors
  const { httpErrors } = await import("@fastify/sensible");

  return {
    // biome-ignore lint/complexity/useArrowFunction: Vitest 4 requires function (not arrow) for class constructor mocks
    ProfileSdkWrapper: vi.fn().mockImplementation(function () {
      if (!hoisted.state.canBuildProfileClient) {
        throw new Error("Failed to initialise profile SDK");
      }

      return {
        getProfile: vi.fn((profileId: string) => {
          if (!hoisted.state.doesProfileExist) {
            throw httpErrors.createError(
              hoisted.state.profileErrorStatus,
              "Failed fetching user from profile sdk",
            );
          }
          if (hoisted.state.hasProfileValidEmail) {
            return hoisted.getMockProfile(profileId);
          }
          return { ...hoisted.getMockProfile(profileId), email: "" };
        }),
        getOrganisationWithCache: vi.fn((orgId: string, _cache, _logger) => {
          if (orgId === hoisted.organizationNotExistId) {
            throw hoisted.createHttpError(
              503,
              "Failed fetching organisation from profile sdk",
            );
          }
          return hoisted.getMockOrganisation(orgId);
        }),
      };
    }),
  };
});

beforeAll(() => {
  pool = getPoolFromConnectionString(process.env[DATABASE_TEST_URL_KEY]);
  cache = new NodeCache();
});

beforeEach(() => {
  eventLogger = new MessagingEventLogger(pool, mockLogger);
  hoisted.state.doesProfileExist = true;
  hoisted.state.profileErrorStatus = hoisted.profileStatus.unavailable;
  hoisted.state.canBuildProfileClient = true;
  hoisted.state.mustEmailSendingFail = false;
  hoisted.state.hasProfileValidEmail = true;
  hoisted.state.sentEmails = [];
  hoisted.state.preferredLanguage = "en";
  hoisted.state.smtpResponse = hoisted.sesAcceptance;
  cache.flushAll();
  vi.mocked(messagesFailedCounter.add).mockClear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await deleteJobsAndRelatedForOrganization(pool, organizationId);
  await deleteJobsAndRelatedForOrganization(
    pool,
    hoisted.organizationNotExistId,
  );
});

afterAll(async () => {
  if (pool) {
    await pool.end();
  }
});

// Expected events, as (key, status, messageKey)
const deliveryPending = {
  key: "message_delivery",
  status: "pending",
  messageKey: undefined,
};
const inboxDelivered = {
  key: "message_delivery",
  status: "successful",
  messageKey: undefined,
};
const inboxFailed = (messageKey?: string) => ({
  key: "message_delivery",
  status: "failed",
  messageKey,
});
const emailAccepted = {
  key: "email_delivery",
  status: "successful",
  messageKey: undefined,
};
const emailFailed = (messageKey: string) => ({
  key: "email_delivery",
  status: "failed",
  messageKey,
});

// Logged events as (key, status, messageKey), in logged order
async function loggedEvents() {
  const events = await eventLogger.getEvents();

  return events.map(({ type, event }) => ({
    key: type.key,
    status: type.status,
    messageKey: "messageKey" in event ? event.messageKey : undefined,
  }));
}

// messages_failed stages counted by the job, e.g. ["email"]
function failedStages() {
  return vi
    .mocked(messagesFailedCounter.add)
    .mock.calls.map(([, attributes]) => attributes?.stage);
}

// Runs the delivery job behind an inserted job row
function runJob(
  job: { jobId: string; token: string },
  config: Partial<EnvConfig>,
) {
  return executeJob({
    pool,
    logger: mockLogger,
    jobId: job.jobId,
    token: job.token,
    eventLogger,
    i18n: new Translator(),
    config: config as EnvConfig,
    cache,
  });
}

// Creates the organisation's primary provider; returns a config that decrypts it
async function createPrimaryProvider(
  orgId: string,
): Promise<Partial<EnvConfig>> {
  const config = {
    EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
  const provider = new EmailSpecificProvider(
    pool,
    orgId,
    new CryptographyService(config),
  );
  await provider.create({
    inputBody: {
      fromAddress: "mock@mail.com",
      providerName: "MockName",
      isPrimary: true,
      type: ProviderTypes.Email,
      smtpHost: "host",
      smtpPort: 123,
      username: "user",
      password: "supersecret",
      ssl: true,
      headers: null,
    },
  });

  return config;
}

// Deletes a message's committed events, which would block deleting the message
async function deleteEvents(messageId: string) {
  await pool.query("DELETE FROM message_event_summary WHERE message_id = $1", [
    messageId,
  ]);
  await pool.query("DELETE FROM messaging_event_logs WHERE message_id = $1", [
    messageId,
  ]);
}

// Makes Postgres reject every update of one row; returns the undo
async function failRowUpdates(table: "messages" | "jobs", rowId: string) {
  await pool.query(`
    CREATE FUNCTION fail_row_update() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION '${table} update rejected';
    END $$ LANGUAGE plpgsql
  `);
  await pool.query(`
    CREATE TRIGGER fail_row_update BEFORE UPDATE ON ${table}
    FOR EACH ROW WHEN (OLD.id = '${rowId}')
    EXECUTE FUNCTION fail_row_update()
  `);

  return async () => {
    await pool.query(`DROP TRIGGER fail_row_update ON ${table}`);
    await pool.query("DROP FUNCTION fail_row_update");
  };
}

// Makes the pool reject every query containing the SQL fragment; returns the undo
function failQueries(sqlFragment: string) {
  const query = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  const spy = vi.spyOn(pool, "query").mockImplementation(((
    text: unknown,
    ...rest: unknown[]
  ) => {
    if (typeof text === "string" && text.includes(sqlFragment)) {
      return Promise.reject(new Error("query rejected"));
    }

    return query(text, ...rest);
  }) as never);

  return () => spy.mockRestore();
}

// Delivers to the Inbox through a first run whose email the provider rejects
async function deliverInboxOnly(
  job: { jobId: string; token: string },
  config: Partial<EnvConfig>,
) {
  hoisted.state.mustEmailSendingFail = true;
  await runJob(job, config);
  hoisted.state.mustEmailSendingFail = false;

  // The scheduler calls back again; each callback has its own event logger
  eventLogger = new MessagingEventLogger(pool, mockLogger);
  vi.mocked(messagesFailedCounter.add).mockClear();
}

describe("Execute job", () => {
  // What the scheduler gets back for a job it cannot claim
  const jobNotFound = { statusCode: 404, message: "job doesn't exist" };
  const jobInProgress = {
    statusCode: 400,
    message: "job is already in progress",
  };

  it("should handle errors if no job exists", async () => {
    await expect(
      executeJob({
        pool,
        logger: mockLogger,
        jobId: randomUUID(),
        token: randomUUID(),
        eventLogger,
        i18n: new Translator(),
        config: {} as EnvConfig,
        cache,
      }),
    ).rejects.toMatchObject(jobNotFound);

    // An unrelated callback leaves no trace on any message
    expect(await loggedEvents()).toStrictEqual([]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("logs nothing for a callback with a wrong token", async () => {
    const insertedJob = await insertMockJob({ pool, organizationId });

    await expect(
      runJob({ ...insertedJob, token: randomUUID() }, {}),
    ).rejects.toMatchObject(jobNotFound);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Pending);

    expect(await loggedEvents()).toStrictEqual([]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("should throw if already running", async () => {
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      status: "working",
    });
    await expect(
      executeJob({
        pool,
        logger: mockLogger,
        jobId: insertedJob.jobId,
        token: insertedJob.token,
        eventLogger,
        i18n: new Translator(),
        config: {} as EnvConfig,
        cache,
      }),
    ).rejects.toMatchObject(jobInProgress);

    // A duplicate callback must not mark the message Failed
    expect(await loggedEvents()).toStrictEqual([]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("logs nothing for a duplicate callback on a delivered job", async () => {
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      status: "delivered",
    });

    await expect(runJob(insertedJob, {})).rejects.toMatchObject(jobNotFound);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(await loggedEvents()).toStrictEqual([]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("logs a claim database error against the message", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    const undo = await failRowUpdates("jobs", insertedJob.jobId);
    try {
      await expect(runJob(insertedJob, {})).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed fetching/updating job",
      });
    } finally {
      await undo();
    }

    // Still pending, so a scheduler retry can claim it
    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Pending);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxFailed("jobClaimError"),
    ]);
    expect((await eventLogger.getEvents()).at(-1)?.event.messageId).toBe(
      insertedMessage.id,
    );
    expect(failedStages()).toStrictEqual(["deliver"]);
  });

  it("logs nothing when the job cannot be read", async () => {
    const insertedJob = await insertMockJob({ pool, organizationId });

    // A closed pool fails the first query, before the message ID is known
    const closedPool = getPoolFromConnectionString(
      process.env[DATABASE_TEST_URL_KEY],
    );
    await closedPool.end();

    await expect(
      executeJob({
        pool: closedPool,
        logger: mockLogger,
        jobId: insertedJob.jobId,
        token: insertedJob.token,
        eventLogger,
        i18n: new Translator(),
        config: {} as EnvConfig,
        cache,
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Failed fetching/updating job",
    });

    expect(await loggedEvents()).toStrictEqual([]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("logs a job row missing required fields against the message", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: "",
    });

    await expect(runJob(insertedJob, {})).rejects.toThrow(
      "missing critical fields",
    );

    // Not left working, which would refuse every retry as already running
    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxFailed("jobMissingFields"),
    ]);
    expect((await eventLogger.getEvents()).at(-1)?.event.messageId).toBe(
      insertedMessage.id,
    );
    expect(failedStages()).toStrictEqual(["deliver"]);
  });

  it("fails a job of unknown type", async () => {
    const insertedJob = await insertMockJob({ pool, organizationId });
    await pool.query("UPDATE jobs SET job_type = 'unknown' WHERE id = $1", [
      insertedJob.jobId,
    ]);

    await runJob(insertedJob, {});

    // Not left working, which would refuse every retry as already running
    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([deliveryPending]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("should set jobs as failed if message does not exist", async () => {
    const insertedJob = await insertMockJob({ pool, organizationId });
    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {} as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);

    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      emailFailed("messageFetchError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
  });

  it("should set jobs and messages as delivered if message does not have transports", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {} as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Delivered);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
    ]);
  });

  it("should set jobs as delivered if only sent to LifeEvents", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.LIFE_EVENT],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {} as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    const events = await eventLogger.getEvents();
    const deliverEvent = events.find(
      (e) => e.type === MessagingEventType.deliverMessage,
    );
    expect(deliverEvent).toBeDefined();
  });

  it("should set jobs as failed if profile does not exist", async () => {
    hoisted.state.doesProfileExist = false;
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {} as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(false);

    const events = await eventLogger.getEvents();
    const errorEvent = events.find(
      (e) => e.type === MessagingEventType.deliverMessageError,
    );
    expect(errorEvent).toBeDefined();
    if (errorEvent && "messageKey" in errorEvent.event) {
      expect(errorEvent.event.messageKey).toBe("profileFetchError");
    }
  });

  it.each([
    { status: hoisted.profileStatus.notFound, messageKey: "profileNotFound" },
    {
      status: hoisted.profileStatus.unavailable,
      messageKey: "profileFetchError",
    },
  ])(
    "logs $messageKey when the profile lookup fails with $status",
    async ({ status, messageKey }) => {
      hoisted.state.doesProfileExist = false;
      hoisted.state.profileErrorStatus = status;
      const config = await createPrimaryProvider(organizationId);
      const insertedMessage = await insertMockMessage({
        pool,
        organizationId,
        transports: [AvailableTransports.EMAIL],
      });
      const insertedJob = await insertMockJob({
        pool,
        organizationId,
        entityId: insertedMessage.id,
        userId: insertedMessage.user_id,
      });

      await runJob(insertedJob, config);

      const job = await getJob(pool, insertedJob.jobId, organizationId);
      const gotMessage = await getMessage(
        pool,
        insertedJob.userId,
        insertedMessage.id,
      );
      expect(job?.status).toStrictEqual(JobStatus.Failed);
      expect(gotMessage?.delivered).toStrictEqual(false);

      // No email event: the email was never attempted
      expect(await loggedEvents()).toStrictEqual([
        deliveryPending,
        inboxFailed(messageKey),
      ]);
      expect((await eventLogger.getEvents()).at(-1)?.event.messageId).toBe(
        insertedMessage.id,
      );
      expect(failedStages()).toStrictEqual(["deliver"]);
      expect(hoisted.state.sentEmails).toStrictEqual([]);
    },
  );

  it("logs sdkInitError when the profile client cannot be built", async () => {
    hoisted.state.canBuildProfileClient = false;
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job?.status).toStrictEqual(JobStatus.Failed);
    expect(gotMessage?.delivered).toStrictEqual(false);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxFailed("sdkInitError"),
    ]);
    expect((await eventLogger.getEvents()).at(-1)?.event.messageId).toBe(
      insertedMessage.id,
    );
    expect(failedStages()).toStrictEqual(["deliver"]);
    expect(hoisted.state.sentEmails).toStrictEqual([]);
  });

  it("emits messages_failed{stage:deliver} when profile fetch fails during delivery", async () => {
    hoisted.state.doesProfileExist = false;
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {} as EnvConfig,
      cache,
    });

    expect(messagesFailedCounter.add).toHaveBeenCalledWith(1, {
      organizationId: expect.any(String),
      stage: "deliver",
    });
  });

  it("emits messages_failed{stage:email} when email sending fails", async () => {
    hoisted.state.mustEmailSendingFail = true;
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.LIFE_EVENT, AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    expect(messagesFailedCounter.add).toHaveBeenCalledWith(1, {
      organizationId: expect.any(String),
      stage: "email",
    });
  });

  it("should set jobs as succesful if email succeeds", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailAccepted,
    ]);
  });

  it("records message_delivery_duration on successful delivery", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    expect(messageDeliveryDurationHistogram.record).toHaveBeenCalledWith(
      expect.any(Number),
      { organizationId: expect.any(String) },
    );
    const [seconds] = vi.mocked(messageDeliveryDurationHistogram.record).mock
      .calls[0];
    expect(seconds).toBeGreaterThanOrEqual(0);
  });

  it("logs the accepted email with SES's message ID", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });
    vi.mocked(messagesSentCounter.add).mockClear();
    vi.mocked(messageDeliveryDurationHistogram.record).mockClear();

    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailAccepted,
    ]);
    expect((await eventLogger.getEvents()).at(-1)?.event).toStrictEqual({
      messageId: insertedMessage.id,
      providerMessageId: hoisted.sesMessageId,
    });
    expect(failedStages()).toStrictEqual([]);

    // Recorded once per accepted email
    expect(messagesSentCounter.add).toHaveBeenCalledTimes(1);
    expect(messageDeliveryDurationHistogram.record).toHaveBeenCalledTimes(1);
  });

  it("omits the provider message ID from another SMTP acceptance", async () => {
    // Organisation-owned SMTP servers answer in their own form, e.g. Postfix
    hoisted.state.smtpResponse = "250 2.0.0 Ok: queued as 4F2C81A0B3";
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailAccepted,
    ]);
    expect((await eventLogger.getEvents()).at(-1)?.event).toStrictEqual({
      messageId: insertedMessage.id,
    });
  });

  it("matches the delivered filter through the accepted email", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await runJob(insertedJob, config);

    try {
      await eventLogger.commit();
      const events = await listMessageEvents({
        pagination: { offset: "0", limit: "10" },
        pool,
        organizationId,
        status: "delivered",
        messageId: insertedMessage.id,
      });

      // The latest event is the email acceptance, not the Inbox delivery
      expect(events.totalCount).toBe(1);
      expect(events.data.at(0)).toMatchObject({
        eventType: "email_delivery",
        eventStatus: "successful",
      });
    } finally {
      await deleteEvents(insertedMessage.id);
    }
  });

  it("should set jobs as failed if email sending fails", async () => {
    hoisted.state.mustEmailSendingFail = true;
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.LIFE_EVENT, AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("failedToSend"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);

    // details keep the serialised SMTP error
    const emailEvent = (await eventLogger.getEvents()).at(-1)?.event as {
      details?: string;
    };
    expect(JSON.parse(emailEvent.details ?? "")).toStrictEqual(
      hoisted.smtpRejection,
    );
  });

  it("should set jobs as failed if email address is empty", async () => {
    hoisted.state.hasProfileValidEmail = false;
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("noEmail"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
    expect((await eventLogger.getEvents()).at(-1)?.event).toStrictEqual({
      messageId: insertedMessage.id,
      messageKey: "noEmail",
    });
  });

  it("logs an email failure when the message has no subject", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
      subject: " ",
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("noSubject"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
    expect((await eventLogger.getEvents()).at(-1)?.event).toStrictEqual({
      messageId: insertedMessage.id,
      messageKey: "noSubject",
    });
  });

  it("should set jobs as failed if cannot fetch organisation", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      hoisted.organizationNotExistId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId: hoisted.organizationNotExistId,
      transports: [AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId: hoisted.organizationNotExistId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    const job = await getJob(
      pool,
      insertedJob.jobId,
      hoisted.organizationNotExistId,
    );
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("organisationFetchError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
  });

  it("reads the message before looking up the organisation", async () => {
    const insertedJob = await insertMockJob({
      pool,
      organizationId: hoisted.organizationNotExistId,
    });

    await runJob(insertedJob, {});

    const job = await getJob(
      pool,
      insertedJob.jobId,
      hoisted.organizationNotExistId,
    );
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      emailFailed("messageFetchError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
  });

  it("logs a message read failure after the Inbox delivery as an email failure", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    // Fails only the read of the message to deliver
    const undo = failQueries('AS "transports"');
    try {
      await runJob(insertedJob, config);
    } finally {
      undo();
    }

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job?.status).toStrictEqual(JobStatus.Failed);
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("messageFetchError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
    expect(hoisted.state.sentEmails).toStrictEqual([]);
  });

  it("skips the organisation lookup when there is no Email transport", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId: hoisted.organizationNotExistId,
      transports: [AvailableTransports.LIFE_EVENT],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId: hoisted.organizationNotExistId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await runJob(insertedJob, {});

    const job = await getJob(
      pool,
      insertedJob.jobId,
      hoisted.organizationNotExistId,
    );
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job?.status).toStrictEqual(JobStatus.Delivered);
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
    ]);
    expect(failedStages()).toStrictEqual([]);
  });

  it("logs an email failure when no Email provider is available", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    // No encryption key: neither the primary nor the default provider can be built
    await runJob(insertedJob, {});

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("noProvider"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
  });

  it("logs an email failure when the secure message cannot be prepared", async () => {
    // The secure email links to the portal; without the URL it cannot be built
    vi.stubEnv("MESSAGING_SECURE_MESSAGE_URL", "");
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
      securityLevel: "confidential",
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailFailed("secureMessagePreparationError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
    expect(hoisted.state.sentEmails).toStrictEqual([]);
  });

  it("retries the email of a re-run job without a second Inbox delivery", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    hoisted.state.mustEmailSendingFail = true;
    await runJob(insertedJob, config);
    const failedJob = await getJob(pool, insertedJob.jobId, organizationId);
    expect(failedJob?.status).toStrictEqual(JobStatus.Failed);

    // The scheduler calls back again; each callback has its own event logger
    hoisted.state.mustEmailSendingFail = false;
    eventLogger = new MessagingEventLogger(pool, mockLogger);
    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job?.status).toStrictEqual(JobStatus.Delivered);
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      emailAccepted,
    ]);
    expect(hoisted.state.sentEmails).toHaveLength(1);
  });

  it("logs the Inbox delivery when a re-run finds the profile", async () => {
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.LIFE_EVENT],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    hoisted.state.doesProfileExist = false;
    await runJob(insertedJob, {});

    hoisted.state.doesProfileExist = true;
    eventLogger = new MessagingEventLogger(pool, mockLogger);
    await runJob(insertedJob, {});

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job?.status).toStrictEqual(JobStatus.Delivered);
    expect(gotMessage?.delivered).toStrictEqual(true);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
    ]);
  });

  it.each([
    { messageKey: "sdkInitError", state: { canBuildProfileClient: false } },
    {
      messageKey: "profileNotFound",
      state: {
        doesProfileExist: false,
        profileErrorStatus: hoisted.profileStatus.notFound,
      },
    },
    { messageKey: "profileFetchError", state: { doesProfileExist: false } },
  ])(
    "logs a re-run's $messageKey after the Inbox delivery as an email failure",
    async ({ messageKey, state }) => {
      const config = await createPrimaryProvider(organizationId);
      const insertedMessage = await insertMockMessage({
        pool,
        organizationId,
        transports: [AvailableTransports.EMAIL],
      });
      const insertedJob = await insertMockJob({
        pool,
        organizationId,
        entityId: insertedMessage.id,
        userId: insertedMessage.user_id,
      });
      await deliverInboxOnly(insertedJob, config);

      Object.assign(hoisted.state, state);
      await runJob(insertedJob, config);

      const job = await getJob(pool, insertedJob.jobId, organizationId);
      expect(job?.status).toStrictEqual(JobStatus.Failed);

      // The message stays readable, so only the email can have failed
      expect(await loggedEvents()).toStrictEqual([
        deliveryPending,
        emailFailed(messageKey),
      ]);
      expect(failedStages()).toStrictEqual(["email"]);
    },
  );

  it("logs a re-run's claim error after the Inbox delivery as an email failure", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });
    await deliverInboxOnly(insertedJob, config);

    const undo = await failRowUpdates("jobs", insertedJob.jobId);
    try {
      await expect(runJob(insertedJob, config)).rejects.toMatchObject({
        statusCode: 500,
        message: "Failed fetching/updating job",
      });
    } finally {
      await undo();
    }

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      emailFailed("jobClaimError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
  });

  it("logs a delivered message's job row missing fields as an email failure", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });
    await deliverInboxOnly(insertedJob, config);
    const brokenJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: "",
    });

    await expect(runJob(brokenJob, config)).rejects.toThrow(
      "missing critical fields",
    );

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      emailFailed("jobMissingFields"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
  });

  it("logs a re-run's Inbox write error after the Inbox delivery as an email failure", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });
    await deliverInboxOnly(insertedJob, config);

    // A row trigger never fires here: the write skips an already delivered row
    const undo = failQueries("is_delivered = true");
    try {
      await runJob(insertedJob, config);
    } finally {
      undo();
    }

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Failed);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      emailFailed("inboxDeliveryError"),
    ]);
    expect(failedStages()).toStrictEqual(["email"]);
    expect(hoisted.state.sentEmails).toStrictEqual([]);
  });

  it("fails the job when the Inbox delivery cannot be recorded", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    const undo = await failRowUpdates("messages", insertedMessage.id);
    try {
      await runJob(insertedJob, config);
    } finally {
      await undo();
    }

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job?.status).toStrictEqual(JobStatus.Failed);
    expect(gotMessage?.delivered).toStrictEqual(false);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxFailed("inboxDeliveryError"),
    ]);
    expect((await eventLogger.getEvents()).at(-1)?.event.messageId).toBe(
      insertedMessage.id,
    );
    expect(failedStages()).toStrictEqual(["deliver"]);
    expect(hoisted.state.sentEmails).toStrictEqual([]);
  });

  it("keeps an accepted email when its metrics fail", async () => {
    const config = await createPrimaryProvider(organizationId);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
    });
    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    // Raised after the provider accepted the email
    vi.mocked(messagesSentCounter.add).mockImplementationOnce(() => {
      throw new Error("metrics unavailable");
    });
    await runJob(insertedJob, config);

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(await loggedEvents()).toStrictEqual([
      deliveryPending,
      inboxDelivered,
      emailAccepted,
    ]);
    expect(failedStages()).toStrictEqual([]);
    expect(hoisted.state.sentEmails).toHaveLength(1);
  });

  it("should use default provider if primary email provider is missing", async () => {
    // no provider is created
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.LIFE_EVENT, AvailableTransports.EMAIL],
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      } as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);

    const events = await eventLogger.getEvents();
    const deliverEvent = events.find(
      (e) => e.type === MessagingEventType.deliverMessage,
    );
    expect(deliverEvent).toBeDefined();
  });

  it("should send confidential message body when requested", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
      securityLevel: "confidential",
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    const job = await getJob(pool, insertedJob.jobId, organizationId);
    const gotMessage = await getMessage(
      pool,
      insertedJob.userId,
      insertedMessage.id,
    );
    expect(job).toBeDefined();
    expect(job?.status).toStrictEqual(JobStatus.Delivered);

    expect(gotMessage).toBeDefined();
    expect(gotMessage?.delivered).toStrictEqual(true);
    const mockOrgTranslations = hoisted.getMockOrganisation(organizationId);

    expect(hoisted.state.sentEmails[0].html).toContain(
      mockOrgTranslations.translations.en.name,
    );
    expect(hoisted.state.sentEmails[0].html).toContain(
      "<p>A new message has been sent to your MessagingIE account",
    );
    expect(hoisted.state.sentEmails[0].subject).toContain(
      "You have received a new secure message",
    );
    expect(hoisted.state.sentEmails[0].subject).toContain(
      mockOrgTranslations.translations.en.name,
    );
    expect(hoisted.state.sentEmails[0].text).toContain(
      "A new message has been sent to your MessagingIE account",
    );
    expect(hoisted.state.sentEmails[0].text).toContain(
      mockOrgTranslations.translations.en.name,
    );

    const events = await eventLogger.getEvents();
    const deliverEvent = events.find(
      (e) => e.type === MessagingEventType.deliverMessage,
    );
    expect(deliverEvent).toBeDefined();
  });

  it("should send confidential message body when requested  - ga translation", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    hoisted.state.preferredLanguage = "ga";
    const provider = new EmailSpecificProvider(
      pool,
      organizationId,
      new CryptographyService({
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      }),
    );
    await provider.create({
      inputBody: {
        fromAddress: "mock@mail.com",
        providerName: "MockName",
        isPrimary: true,
        type: ProviderTypes.Email,
        smtpHost: "host",
        smtpPort: 123,
        username: "user",
        password: "supersecret",
        ssl: true,
        headers: null,
      },
    });
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId,
      transports: [AvailableTransports.EMAIL],
      securityLevel: "confidential",
    });

    const insertedJob = await insertMockJob({
      pool,
      organizationId,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
    });

    await executeJob({
      pool,
      logger: mockLogger,
      jobId: insertedJob.jobId,
      token: insertedJob.token,
      eventLogger,
      i18n: new Translator(),
      config: {
        EMAIL_PROVIDER_SMTP_ENCRYPTION_KEY: encryptionKey,
      } as EnvConfig,
      cache,
    });

    const mockOrgTranslations = hoisted.getMockOrganisation(organizationId);

    expect(hoisted.state.sentEmails[0].html).toContain(
      "<p>A Mock Public Name, a chara,",
    );
    expect(hoisted.state.sentEmails[0].html).toContain(
      mockOrgTranslations.translations.ga.name,
    );
    expect(hoisted.state.sentEmails[0].subject).toContain(
      "Tá teachtaireacht shlán nua faighte agat",
    );
    expect(hoisted.state.sentEmails[0].subject).toContain(
      mockOrgTranslations.translations.ga.name,
    );
    expect(hoisted.state.sentEmails[0].text).toContain(
      "Tá teachtaireacht nua seolta chuig do chuntas MessagingIE",
    );
    expect(hoisted.state.sentEmails[0].text).toContain(
      mockOrgTranslations.translations.ga.name,
    );

    const events = await eventLogger.getEvents();
    const deliverEvent = events.find(
      (e) => e.type === MessagingEventType.deliverMessage,
    );
    expect(deliverEvent).toBeDefined();
  });

  it("getPendingJobPerOrganization should work as expected", async () => {
    const pendingOrg = randomUUID().substring(0, 8);
    const insertedMessage = await insertMockMessage({
      pool,
      organizationId: pendingOrg,
      transports: [AvailableTransports.LIFE_EVENT, AvailableTransports.EMAIL],
    });

    await insertMockJob({
      pool,
      organizationId: pendingOrg,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
      status: "pending",
    });
    // Job that should not be counted as pending as it's already delivered
    await insertMockJob({
      pool,
      organizationId: pendingOrg,
      entityId: insertedMessage.id,
      userId: insertedMessage.user_id,
      status: "delivered",
    });

    const secondPendingOrg = randomUUID().substring(0, 8);
    const secondInsertedMessage = await insertMockMessage({
      pool,
      organizationId: secondPendingOrg,
      transports: [AvailableTransports.LIFE_EVENT, AvailableTransports.EMAIL],
    });

    await insertMockJob({
      pool,
      organizationId: secondPendingOrg,
      entityId: secondInsertedMessage.id,
      userId: secondInsertedMessage.user_id,
      status: "pending",
    });

    const jobs = await getPendingJobPerOrganization({
      pool,
      logger: mockLogger,
    });

    expect(jobs).toBeDefined();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    const pendingOrgJob = jobs.find((j) => j.organizationId === pendingOrg);
    const pendingSecondOrgJob = jobs.find(
      (j) => j.organizationId === secondPendingOrg,
    );
    expect(pendingOrgJob).toBeDefined();
    expect(pendingSecondOrgJob).toBeDefined();
    expect(pendingOrgJob?.counter).toBe(1);
    expect(pendingSecondOrgJob?.counter).toBe(1);
  });
});
