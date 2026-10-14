import type { Analytics } from "@ogcio/building-blocks-sdk/dist/types/index.js";
import type { FastifyBaseLogger } from "fastify";
import type { Pool, PoolClient } from "pg";
import { type ImportStatus, ImportStatuses } from "~/const/profile.js";
import type { EnvConfig } from "~/plugins/external/env.js";
import {
  CascadeConsentReasons,
  ConsentStatuses,
  ConsentSubjects,
} from "~/schemas/consents/shared.js";
import type {
  KnownProfileDataDetails,
  ProfileImportDetail,
} from "~/schemas/profiles/model.js";
import { getCurrentConsentStatement } from "~/services/consent-statements/consent-statements-service.js";
import { submitConsent } from "~/services/consents/consents-service.js";
import { buildJobUrl } from "~/services/profiles/build-job-url.js";
import {
  createLogtoUsers,
  type LogtoError,
} from "~/services/profiles/create-logto-users.js";
import { createUpdateProfileDetailsBulk } from "~/services/profiles/create-update-profile-details.js";
import { checkProfileImportCompletion } from "~/services/profiles/sql/check-profile-import-completion.js";
import { createProfileImport } from "~/services/profiles/sql/create-profile-import.js";
import { createProfileImportDetails } from "~/services/profiles/sql/create-profile-import-details.js";
import { getProfileImport } from "~/services/profiles/sql/get-profile-import.js";
import { getProfileImportDetails as getProfileImportDetailsSql } from "~/services/profiles/sql/get-profile-import-details.js";
import { getProfileImportStatus } from "~/services/profiles/sql/get-profile-import-status.js";
import { selectProfileIdsWithNotSetConsentStatuses } from "~/services/profiles/sql/get-profiles-consent-statuses.js";
import { lookupProfilesBulk } from "~/services/profiles/sql/lookup-profile.js";
import { selectProfileImportDetails } from "~/services/profiles/sql/select-profile-import-details.js";
import { updateProfileImportDetails } from "~/services/profiles/sql/update-profile-import-details.js";
import { updateProfileImportDetailsBatchNumber } from "~/services/profiles/sql/update-profile-import-details-batch-number.js";
import { updateProfileImportDetailsStatus } from "~/services/profiles/sql/update-profile-import-details-status.js";
import { updateProfileImportStatus } from "~/services/profiles/sql/update-profile-import-status.js";
import { PROFILE_IMPORT_EVENT_ACTIONS } from "~/services/tracking.js";
import {
  getOrgAnalyticsSdk,
  getOrgSchedulerSdk,
} from "~/utils/authentication-factory.js";
import type { SavedFileInfo } from "~/utils/save-request-file.js";
import { withClient } from "~/utils/with-client.js";
import { withRollback } from "~/utils/with-rollback.js";

const CONSENT_SUBJECT = ConsentSubjects.Messaging;

const chunks = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );

/**
 * Utility to extract successful and failed profile IDs based on emails
 */
const extractProfileIds = (params: {
  profiles: { email: string }[];
  successfulEmails: string[];
  profileImportDetailsMap: Map<string, string>;
}) => {
  const { profiles, successfulEmails, profileImportDetailsMap } = params;

  const successfulIds: string[] = [];
  const failedIds: string[] = [];
  for (const p of profiles) {
    const id = profileImportDetailsMap.get(p.email);
    if (id !== undefined) {
      if (successfulEmails.includes(p.email)) {
        successfulIds.push(id);
      } else {
        failedIds.push(id);
      }
    }
  }
  return { successfulIds, failedIds };
};

export const scheduleImportProfiles = async (params: {
  pool: Pool;
  logger: FastifyBaseLogger;
  organizationId: string;
  config: EnvConfig;
  source: "json" | "csv";
  fileMetadata?: SavedFileInfo["metadata"];
  profiles: KnownProfileDataDetails[];
  immediate?: boolean;
  insertPrivateDetails: boolean;
  onlyPrivateDetails: boolean;
}): Promise<{ status: ImportStatus; profileImportId: string }> =>
  withClient(params.pool, async (client) => {
    const { jobToken, profileImportId } = await createProfileImportAndDetails({
      client,
      ...params,
    });

    if (params.immediate) {
      return executeImportProfiles({
        pool: params.pool,
        client,
        logger: params.logger,
        profileImportId,
        config: params.config,
        insertPrivateDetails: params.insertPrivateDetails,
        onlyPrivateDetails: params.onlyPrivateDetails,
        batchIndex: 0,
        totalBatches: 1,
      });
    }

    return prepareAsyncImportExecution({
      client,
      logger: params.logger,
      organizationId: params.organizationId,
      config: params.config,
      profileImportId,
      insertPrivateDetails: params.insertPrivateDetails,
      onlyPrivateDetails: params.onlyPrivateDetails,
      jobToken,
    });
  });

async function prepareAsyncImportExecution(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  organizationId: string;
  config: EnvConfig;
  profileImportId: string;
  insertPrivateDetails: boolean;
  onlyPrivateDetails: boolean;
  jobToken: string;
}): Promise<{ status: ImportStatus; profileImportId: string }> {
  const schedulerSdk = await getOrgSchedulerSdk(
    params.logger,
    params.organizationId,
    params.config,
  );
  const importDetailsIdList = await selectProfileImportDetails(
    params.client,
    params.profileImportId,
  );
  const batches = chunks(
    importDetailsIdList,
    params.config.PROFILES_IMPORTER_BATCH_SIZE,
  );

  const tasks = await Promise.all(
    batches.map(async (_, index) => {
      const scheduleDate = new Date();
      scheduleDate.setSeconds(
        scheduleDate.getSeconds() +
          index * params.config.PROFILES_IMPORTER_BATCH_DELAY_SECONDS,
      );

      const url = buildJobUrl({
        hostUrl: params.config.HOST_URL,
        insertPrivateDetails: params.insertPrivateDetails,
        onlyPrivateDetails: params.onlyPrivateDetails,
        batchIndex: index,
        totalBatches: batches.length,
        profileImportId: params.profileImportId,
      });

      params.logger.info(
        `${params.profileImportId} [Processor] Scheduling batch ${index} (${batches[index].length} profiles) at time ${scheduleDate.toISOString()}`,
      );

      // find all import details ids in the batch and update the batch number
      const batchImportDetailsIds = batches[index].map((id) => id as string);
      await updateProfileImportDetailsBatchNumber(
        params.client,
        batchImportDetailsIds,
        index,
      );

      return {
        executeAt: scheduleDate.toISOString(),
        webhookUrl: url.toString(),
        webhookAuth: params.jobToken,
      };
    }),
  );

  const result = (await schedulerSdk.scheduleTasks(tasks)) as {
    error?: unknown;
  };
  if (result.error) {
    params.logger.error(
      `${params.profileImportId} [Processor] | Updating statuses to FAILED for ${importDetailsIdList.length} profiles`,
    );
    params.logger.error(
      `${params.profileImportId} [Processor] | ${result.error}`,
    );
    await updateProfileImportDetailsStatus(
      params.client,
      importDetailsIdList,
      ImportStatuses.FAILED,
    );
    throw result;
  }
  return {
    status: ImportStatuses.PENDING,
    profileImportId: params.profileImportId,
  };
}

export const executeImportProfiles = async (params: {
  pool: Pool;
  client?: PoolClient;
  logger: FastifyBaseLogger;
  profileImportId: string;
  config: EnvConfig;
  insertPrivateDetails: boolean;
  onlyPrivateDetails: boolean;
  batchIndex: number;
  totalBatches: number;
}): Promise<{ status: ImportStatus; profileImportId: string }> => {
  const run = async (client: PoolClient) => {
    const { organisationId, profileImportDetails } = await withRollback(
      client,
      async () => {
        const imported = await getProfileImport(client, params.profileImportId);
        const profileImportDetails = await getProfileImportDetailsSql(
          client,
          params.profileImportId,
          params.batchIndex,
        );
        return {
          organisationId: imported.organisationId,
          profileImportDetails,
        };
      },
    );

    params.logger.info(
      `${params.profileImportId} [Processor] Processing batch ${params.batchIndex} (${profileImportDetails.length} profiles) of ${params.totalBatches} batches.`,
    );

    return importProfiles({
      pool: params.pool,
      client,
      logger: params.logger,
      profileImportDetails,
      organizationId: organisationId,
      config: params.config,
      profileImportId: params.profileImportId,
      insertPrivateDetails: params.insertPrivateDetails,
      onlyPrivateDetails: params.onlyPrivateDetails,
      analyticsSdk: await getOrgAnalyticsSdk(
        params.config,
        params.logger,
        organisationId,
      ),
    });
  };

  if (params.client) {
    return run(params.client);
  }

  return withClient(params.pool, run);
};

const createProfileImportAndDetails = async (params: {
  client: PoolClient;
  profiles: KnownProfileDataDetails[];
  organizationId: string;
  source: "json" | "csv";
  fileMetadata?: SavedFileInfo["metadata"];
}): Promise<{ jobToken: string; profileImportId: string }> => {
  const { client, profiles, organizationId, source, fileMetadata } = params;
  return withRollback(client, async () => {
    const { jobToken, profileImportId } = await createProfileImport(
      client,
      organizationId,
      source,
      fileMetadata,
    );

    await createProfileImportDetails(client, profileImportId, profiles);
    return { jobToken, profileImportId };
  });
};

export const importProfiles = async (params: {
  pool: Pool;
  client?: PoolClient;
  logger: FastifyBaseLogger;
  profileImportDetails: (KnownProfileDataDetails & {
    id: string;
    status: string;
    batch: number;
  })[];
  organizationId: string;
  config: EnvConfig;
  profileImportId: string;
  insertPrivateDetails: boolean;
  onlyPrivateDetails: boolean;
  analyticsSdk: Analytics;
}): Promise<{ status: ImportStatus; profileImportId: string }> => {
  const run = async (client: PoolClient) => {
    // 1. Update profile details statuses to PROCESSING and prepare data
    const { profilesToUpdate, profilesToCreate, profileImportDetailsMap } =
      await importStartup({ ...params, client });

    // 2. Update profile details
    await importProcessProfilesToBeUpdated({
      ...params,
      profilesToUpdate,
      client,
    });

    // 3. Create Logto users for collected profiles that haven't failed
    await importProcessProfilesToBeCreated({
      ...params,
      profilesToCreate,
      client,
      profileImportDetailsMap,
    });

    // Check completion and update overall status
    return importTeardown({ ...params, client });
  };

  if (params.client) {
    return run(params.client);
  }

  return withClient(params.pool, run);
};

async function importStartup({
  client,
  profileImportId,
  profileImportDetails,
  logger,
  analyticsSdk,
  organizationId,
}: {
  organizationId: string;
  logger: FastifyBaseLogger;
  analyticsSdk: Analytics;
  client: PoolClient;
  profileImportId: string;
  profileImportDetails: (KnownProfileDataDetails & {
    id: string;
    status: string;
    batch: number;
  })[];
}): Promise<{
  profilesToCreate: ProfileImportDetail[];
  profileImportDetailsMap: Map<string, string>;
  profilesToUpdate: {
    profileId: string;
    profileImportDetail: ProfileImportDetail;
  }[];
}> {
  const profileImportDetailsMap = new Map<string, string>();
  const batchImportDetailsIds: string[] = [];
  const batchImportDetailsEmails: string[] = [];
  const profilesToUpdate: {
    profileId: string;
    profileImportDetail: ProfileImportDetail;
  }[] = [];
  const profilesToCreate: ProfileImportDetail[] = [];

  for (const profile of profileImportDetails) {
    batchImportDetailsIds.push(profile.id);
    batchImportDetailsEmails.push(profile.email);
    profileImportDetailsMap.set(profile.email, profile.id);
  }
  try {
    await withRollback(client, async () => {
      await updateProfileImportDetailsStatus(
        client,
        batchImportDetailsIds,
        ImportStatuses.PROCESSING,
      );
      logger.info(
        `${profileImportId} [Processor] | ${ImportStatuses.PROCESSING.toUpperCase()} | ${batchImportDetailsIds.length}`,
      );

      const profileLookups = await lookupProfilesBulk(
        client,
        batchImportDetailsEmails,
      );

      // Process each profile
      for (let j = 0; j < profileImportDetails.length; j++) {
        const profileImportDetail = profileImportDetails[j];
        const lookupResult = profileLookups.get(
          profileImportDetail.email.toLowerCase(),
        );

        if (!lookupResult?.exists) {
          profilesToCreate.push(profileImportDetail);
        } else {
          profilesToUpdate.push({
            profileId: lookupResult.profileId as string,
            profileImportDetail: profileImportDetail,
          });
        }
      }
    });
  } catch (err) {
    logger.error(
      `${profileImportId} [Processor] | ${ImportStatuses.FAILED.toUpperCase()} | ${batchImportDetailsIds.length}`,
    );
    logger.error({ error: err }, `${profileImportId} [Processor]`);

    await updateProfileImportDetails(
      client,
      batchImportDetailsIds,
      err instanceof Error ? err.message : "Unknown error",
      ImportStatuses.FAILED,
    );

    // Track the number of profiles that failed
    analyticsSdk.track.event({
      event: {
        ...PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES,
        name: `${PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES.name} failed`,
        value: batchImportDetailsIds.length,
      },
      contextOverride: {
        customDimensions: {
          organizationId,
        },
      },
    });
  }

  return { profilesToCreate, profileImportDetailsMap, profilesToUpdate };
}

async function importProcessProfilesToBeUpdated({
  profilesToUpdate,
  client,
  logger,
  profileImportId,
  onlyPrivateDetails,
  organizationId,
  insertPrivateDetails,
  analyticsSdk,
}: {
  analyticsSdk: Analytics;
  insertPrivateDetails: boolean;
  onlyPrivateDetails: boolean;
  organizationId: string;
  logger: FastifyBaseLogger;
  client: PoolClient;
  profileImportId: string;
  profilesToUpdate: {
    profileId: string;
    profileImportDetail: ProfileImportDetail;
  }[];
  config: EnvConfig;
}): Promise<void> {
  if (profilesToUpdate.length === 0) {
    return;
  }
  logger.info(
    `${profileImportId} [Processor-Update] | ${ImportStatuses.PROCESSING.toUpperCase()} | ${profilesToUpdate.length}`,
  );
  const completedImportDetailsIds = profilesToUpdate.map(
    ({ profileImportDetail }) => profileImportDetail.id,
  );
  const profileWithData = profilesToUpdate.map(
    ({ profileId, profileImportDetail }) => {
      const { id, status, batch, ...data } = profileImportDetail;
      return {
        profileId,
        data,
      };
    },
  );

  try {
    if (!onlyPrivateDetails) {
      // Apply all updates
      await createUpdateProfileDetailsBulk({
        client,
        organizationId,
        profiles: profileWithData,
        createOnly: false,
      });
    }

    if (insertPrivateDetails) {
      await createUpdateProfileDetailsBulk({
        client,
        organizationId: undefined,
        profiles: profileWithData,
        createOnly: true,
      });
    }

    await updateConsentStatuses(
      profilesToUpdate.map(({ profileId }) => profileId),
      client,
      logger,
      profileImportId,
    );

    logger.info(
      `${profileImportId} [Processor-Update] | ${ImportStatuses.COMPLETED.toUpperCase()} | ${completedImportDetailsIds.length}`,
    );
    await updateProfileImportDetailsStatus(
      client,
      completedImportDetailsIds,
      ImportStatuses.COMPLETED,
    );
  } catch (err) {
    logger.error(
      `${profileImportId} [Processor-Update] | ${ImportStatuses.FAILED.toUpperCase()} | ${completedImportDetailsIds.length}`,
    );
    logger.error({ error: err }, `${profileImportId} [Processor-Update]`);

    await updateProfileImportDetails(
      client,
      completedImportDetailsIds,
      err instanceof Error ? err.message : "Unknown error",
      ImportStatuses.FAILED,
    );

    // Track the number of profiles that failed
    analyticsSdk.track.event({
      event: {
        ...PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES,
        name: `${PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES.name} failed`,
        value: completedImportDetailsIds.length,
      },
      contextOverride: {
        customDimensions: {
          organizationId,
        },
      },
    });
  }
}

async function importProcessProfilesToBeCreated({
  config,
  profilesToCreate,
  client,
  logger,
  profileImportId,
  onlyPrivateDetails,
  organizationId,
  insertPrivateDetails,
  analyticsSdk,
  profileImportDetailsMap,
}: {
  config: EnvConfig;
  analyticsSdk: Analytics;
  insertPrivateDetails: boolean;
  onlyPrivateDetails: boolean;
  organizationId: string;
  logger: FastifyBaseLogger;
  client: PoolClient;
  profileImportId: string;
  profilesToCreate: ProfileImportDetail[];
  profileImportDetailsMap: Map<string, string>;
}) {
  if (profilesToCreate.length === 0) {
    return;
  }
  analyticsSdk.track.event({
    event: {
      ...PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES,
      name: `${PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES.name} to create`,
      value: profilesToCreate.length,
    },
    contextOverride: {
      customDimensions: {
        organizationId,
      },
    },
  });
  const pendingImportDetailsIds = profilesToCreate.map(({ id }) => id);

  // Update statuses
  try {
    await updateProfileImportDetailsStatus(
      client,
      pendingImportDetailsIds,
      ImportStatuses.PENDING,
    );
    logger.info(
      `${profileImportId} [Processor-Create] | ${ImportStatuses.PENDING.toUpperCase()} | ${pendingImportDetailsIds.length}`,
    );
    const results = await createLogtoUsers(
      profilesToCreate,
      config,
      organizationId,
      profileImportId,
      insertPrivateDetails,
      onlyPrivateDetails,
      logger,
    );

    // Mark successful profiles as pending (for webhook)
    const successfulEmails = results.map((r) => r.primaryEmail);
    const { successfulIds } = extractProfileIds({
      profiles: profilesToCreate,
      successfulEmails,
      profileImportDetailsMap,
    });

    analyticsSdk.track.event({
      event: {
        ...PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES,
        name: `${PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES.name} created in Logto`,
        value: successfulIds.length,
      },
      contextOverride: {
        customDimensions: {
          organizationId,
        },
      },
    });

    logger.info(
      `${profileImportId} [Processor-Logto] | Created | ${successfulIds.length}`,
    );
  } catch (err) {
    const logtoError = err as LogtoError;
    logger.error({ error: logtoError }, "Error while creating Logto users");

    // Update both failed and successful profiles in a single transaction
    // Get successful and failed profiles
    const successfulEmails = logtoError?.successfulEmails || [];
    const { successfulIds, failedIds } = extractProfileIds({
      profiles: profilesToCreate,
      successfulEmails,
      profileImportDetailsMap,
    });

    // Update failed profiles
    if (failedIds.length > 0) {
      await updateProfileImportDetails(
        client,
        failedIds,
        logtoError.message,
        ImportStatuses.FAILED,
      );
      logger.info(
        `${profileImportId} [Processor-Logto] | ${ImportStatuses.FAILED.toUpperCase()} | ${failedIds.length}`,
      );
    }

    // Update successful profiles to COMPLETED
    if (successfulIds.length > 0) {
      await updateProfileImportDetailsStatus(
        client,
        successfulIds,
        ImportStatuses.COMPLETED,
      );
      logger.info(
        `${profileImportId} [Processor-Logto] | ${ImportStatuses.COMPLETED.toUpperCase()} | ${successfulIds.length}`,
      );
    }

    analyticsSdk.track.event({
      event: {
        ...PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES,
        name: `${PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_PROCESS_PROFILES.name} failed to create in Logto`,
        value: failedIds.length,
      },
      contextOverride: {
        customDimensions: {
          organizationId,
        },
      },
    });
  }
}

async function importTeardown({
  profileImportId,
  logger,
  client,
  organizationId,
  analyticsSdk,
}: {
  profileImportId: string;
  logger: FastifyBaseLogger;
  client: PoolClient;
  organizationId: string;
  analyticsSdk: Analytics;
}) {
  logger.info(`${profileImportId} [Processor] | Checking completion`);
  const { isComplete, finalStatus } = await checkProfileImportCompletion(
    client,
    profileImportId,
  );

  if (isComplete) {
    await updateProfileImportStatus(client, profileImportId, finalStatus);
  }
  logger.info(`${profileImportId} [Processor] | ${finalStatus.toUpperCase()}`);

  const status = await getProfileImportStatus(client, profileImportId);
  logger.info(`${profileImportId} [Processor] | ${status.toUpperCase()}`);

  const validStatuses: string[] = [
    ImportStatuses.COMPLETED,
    ImportStatuses.SUCCESS,
  ];

  analyticsSdk.track.event({
    event: {
      ...PROFILE_IMPORT_EVENT_ACTIONS.IMPORT_PROFILES_COMPLETED,
      value: validStatuses.includes(status) ? 1 : 0,
    },
    contextOverride: {
      customDimensions: {
        organizationId,
        status,
      },
    },
  });

  // 4. Return current status
  return {
    status,
    profileImportId,
  };
}

async function updateConsentStatuses(
  profileIds: string[],
  client: PoolClient,
  logger: FastifyBaseLogger,
  profileImportId: string,
) {
  const consentStatuses = await selectProfileIdsWithNotSetConsentStatuses(
    profileIds,
    client,
  );

  if (consentStatuses.length === 0) {
    logger.info(
      `${profileImportId} [Processor] | No profiles with not set consent statuses`,
    );
    return;
  }

  const toUpdateConsentStatuses: string[] = [];
  // Submit only for parent profiles that have consent flag enabled
  for (const { id, primaryUserId } of consentStatuses) {
    if (id === primaryUserId) {
      toUpdateConsentStatuses.push(id);
    }
  }

  if (toUpdateConsentStatuses.length === 0) {
    return;
  }

  const consentStatement = await getCurrentConsentStatement({
    client,
    subject: CONSENT_SUBJECT,
  });
  // It could be faster, but as the previous comment states, we
  // should never fall here
  // Process in batches of 10
  const groupedIds = chunks(toUpdateConsentStatuses, 10);
  for (const ids of groupedIds) {
    await Promise.all(
      ids.map((profileId) =>
        submitConsent({
          consentInput: {
            subject: CONSENT_SUBJECT,
            status: ConsentStatuses.PreApproved,
            consentStatementId: consentStatement.id,
          },
          userId: profileId,
          client,
          logger,
          reason: CascadeConsentReasons.FirstImport,
        }),
      ),
    );
  }
}
