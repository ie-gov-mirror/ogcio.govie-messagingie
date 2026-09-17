import { httpErrors } from "@fastify/sensible";
import type { FastifyBaseLogger } from "fastify";
import type { Pool, PoolClient, QueryResult } from "pg";
import type { ConsentStatementWithTranslations } from "~/schemas/consent-statements/shared.js";
import type {
  CitizenSubmitConsentBody,
  CitizenSubmitConsentsBody,
  CitizenSubmitConsentsResponse,
} from "~/schemas/consents/citizen.js";
import type {
  CascadeConsentReason,
  Consent,
  ConsentStatus,
  ConsentSubject,
  ConsentWithStatement,
} from "~/schemas/consents/shared.js";
import {
  ConsentStatuses,
  isValidStatusTransition,
} from "~/schemas/consents/shared.js";
import type {
  SupportSubmitConsentsBody,
  SupportSubmitConsentsResponse,
} from "~/schemas/consents/support.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import type {
  LinkedProfile,
  ProfileWithLinkedProfiles,
} from "~/schemas/profiles/model.js";
import { getCurrentConsentStatement } from "~/services/consent-statements/consent-statements-service.js";
import { getProfile } from "~/services/profiles/get-profile.js";
import { updateConsentStatuses } from "~/services/profiles/sql/update-consent-statuses.js";
import { withClient } from "~/utils/with-client.js";
import { withRollback } from "~/utils/with-rollback.js";

const consentBaseQuery = `
    SELECT pc.id,
        pc.profile_id as "profileId",
        pc.subject,
        pc.status,
        pc.created_at as "createdAt",
        pc.consent_statement_id as "consentStatementId"
    FROM profile_consents pc
`;

export async function getConsentsForUser({
  pool,
  userId,
  paginationParams,
  subject,
  organisationId,
}: {
  pool: Pool;
  userId: string;
  paginationParams: Required<PaginationParams>;
  subject: string;
  organisationId?: string;
}): Promise<{ data: ConsentWithStatement[]; totalCount: number }> {
  return withClient(pool, async (client) => {
    const { rows: rowsCount } = await client.query<{ count: number }>(
      `SELECT COUNT(*)
       FROM profile_consents pc
       WHERE pc.profile_id = $1
         AND pc.subject = $2
         AND (
           $3::text IS NULL
           OR EXISTS (
             SELECT 1
             FROM profile_details pd
             WHERE pd.profile_id = pc.profile_id
               AND pd.organisation_id = $3
               AND pd.is_latest = TRUE
           )
         )`,
      [userId, subject, organisationId ?? null],
    );

    if (!rowsCount[0] || Number(rowsCount[0].count ?? 0) === 0) {
      return { data: [], totalCount: 0 };
    }
    const totalCount = Number(rowsCount[0].count);
    const { rows } = await client.query<
      Consent & {
        version: number;
        cascadeReason: string | null;
        cascadeSourceProfileId: string | null;
        sourceProfileEmail: string | null;
        targetProfileEmail: string | null;
      }
    >(
      `
        SELECT pc.id,
          pc.profile_id as "profileId",
          pc.subject,
          pc.status,
          pc.created_at as "createdAt",
          pc.consent_statement_id as "consentStatementId",
          cs.version,
          pc.cascade_reason as "cascadeReason",
          pc.cascade_source_profile_id as "cascadeSourceProfileId",
          source_profile.email as "sourceProfileEmail",
          target_profile.email as "targetProfileEmail"
        FROM profile_consents pc
        JOIN consent_statements cs ON cs.id = pc.consent_statement_id
        LEFT JOIN profiles source_profile ON pc.cascade_source_profile_id = source_profile.id
        LEFT JOIN profiles target_profile ON pc.profile_id = target_profile.id
        WHERE pc.profile_id = $1
        AND pc.subject = $2
        AND (
          $3::text IS NULL
          OR EXISTS (
            SELECT 1
            FROM profile_details pd
            WHERE pd.profile_id = pc.profile_id
              AND pd.organisation_id = $3
              AND pd.is_latest = TRUE
          )
        )
        ORDER BY pc.created_at DESC
        LIMIT $4::integer OFFSET $5::integer;
      `,
      [
        userId,
        subject,
        organisationId ?? null,
        paginationParams.limit,
        paginationParams.offset,
      ],
    );

    const transformedResults: ConsentWithStatement[] = rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      subject: row.subject,
      status: row.status,
      createdAt: row.createdAt,
      consentStatementId: row.consentStatementId,
      consentStatement: {
        version: row.version,
      },
      cascadeReason: row.cascadeReason,
      cascadeSourceProfileId: row.cascadeSourceProfileId,
      sourceProfileEmail: row.sourceProfileEmail,
      targetProfileEmail: row.targetProfileEmail,
    }));
    return { data: transformedResults, totalCount };
  });
}

export async function getLatestConsentForUser(
  params: {
    userId: string;
  } & ({ pool: Pool } | { client: PoolClient }) & { subject: string },
): Promise<Consent>;
export async function getLatestConsentForUser(
  params: {
    userId: string;
  } & ({ pool: Pool } | { client: PoolClient }) & { subjects: string[] },
): Promise<Consent[]>;
export async function getLatestConsentForUser(
  params: {
    userId: string;
  } & ({ pool: Pool } | { client: PoolClient }) &
    ({ subject: string } | { subjects: string[] }),
): Promise<Consent | Consent[]> {
  let output: Consent | Consent[];
  const subjects = "subject" in params ? [params.subject] : params.subjects;
  if ("pool" in params) {
    output = await withClient(params.pool, async (client) => {
      return executeGetLatestConsentForUser({
        client,
        userId: params.userId,
        subjects,
      });
    });
  } else {
    output = await executeGetLatestConsentForUser({
      client: params.client,
      userId: params.userId,
      subjects,
    });
  }

  if ("subject" in params) {
    if (!output || (Array.isArray(output) && output.length === 0)) {
      throw httpErrors.notFound("User has not consents");
    }
    return output[0];
  }
  return output;
}

async function executeGetLatestConsentForUser(params: {
  client: PoolClient;
  userId: string;
  subjects: ConsentSubject[];
}): Promise<Consent[]> {
  const { rows } = await params.client.query<Consent>(
    `
        ${consentBaseQuery}
        WHERE profile_id = $1 AND subject = ANY($2)
        ORDER BY created_at DESC
        LIMIT 1;
      `,
    [params.userId, params.subjects],
  );

  return rows;
}

function getProfileForConsent(
  params: ({ userId: string } | { profile: ProfileWithLinkedProfiles }) &
    ({ pool: Pool } | { client: PoolClient }),
): Promise<ProfileWithLinkedProfiles> {
  if ("profile" in params) {
    return Promise.resolve(params.profile);
  }
  const basicParams = {
    profileId: params.userId,
    organizationId: undefined,
    addLinkedProfiles: true,
    consentSubjects: [],
  };
  return getProfile({ ...params, ...basicParams });
}

/**
 * Submit a single consent for a user.
 *
 * This function is used for internal operations like webhooks and imports where
 * less strict validation is needed. For user-facing API endpoints, use
 * submitConsents instead which includes additional validation.
 *
 * Key differences:
 * - Less strict validation (doesn't require current active statement)
 * - Designed for system operations rather than user submissions
 * - Used by webhook services and import processes
 */
export async function submitConsent(
  params: {
    consentInput: CitizenSubmitConsentBody;
    logger: FastifyBaseLogger;
    reason: CascadeConsentReason;
  } & (
    | { userId: string }
    | {
        profile: Omit<ProfileWithLinkedProfiles, "linkedProfiles"> & {
          linkedProfiles: LinkedProfile[];
        };
      }
  ) &
    ({ pool: Pool } | { client: PoolClient }),
): Promise<{ id: string }> {
  const profile = await getProfileForConsent(params);

  if (profile.id !== profile.primaryUserId) {
    throw httpErrors.badRequest("Cannot submit consent for a child profile");
  }

  if ("pool" in params)
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeSubmitConsent({
          client,
          profile,
          logger: params.logger,
          consentInput: params.consentInput,
          reason: params.reason,
        });
      }),
    );

  return executeSubmitConsent({
    client: params.client,
    profile,
    logger: params.logger,
    consentInput: params.consentInput,
    reason: params.reason,
  });
}

function executeInsertConsentQuery(
  client: PoolClient,
  profileId: string,
  consentInput: CitizenSubmitConsentBody,
  cascadeInfo?: {
    reason: string;
    sourceProfileId: string;
  },
): Promise<QueryResult<{ id: string }>> {
  const cascadeFields = cascadeInfo
    ? ", cascade_reason, cascade_source_profile_id"
    : "";
  const cascadeValues = cascadeInfo ? ", $5, $6" : "";

  return client.query<{ id: string }>(
    `
    INSERT INTO profile_consents (
        profile_id,
        subject,
        status,
        consent_statement_id${cascadeFields}
    )
    VALUES ($1, $2, $3, $4${cascadeValues})
    RETURNING id;
    `,
    cascadeInfo
      ? [
          profileId,
          consentInput.subject,
          consentInput.status,
          consentInput.consentStatementId,
          cascadeInfo.reason,
          cascadeInfo.sourceProfileId,
        ]
      : [
          profileId,
          consentInput.subject,
          consentInput.status,
          consentInput.consentStatementId,
        ],
  );
}

/**
 * Common consent insertion and status update logic
 */
async function insertConsentAndUpdateStatuses(
  client: PoolClient,
  profileId: string,
  consentInput: CitizenSubmitConsentBody,
  logger: FastifyBaseLogger,
): Promise<{ id: string }> {
  const { rows: consentRows } = await executeInsertConsentQuery(
    client,
    profileId,
    consentInput,
  );

  if (!consentRows || consentRows.length === 0) {
    throw httpErrors.internalServerError(
      "Not have been able to insert consent",
    );
  }

  logger.debug(
    {
      consent_id: consentRows[0].id,
      userId: `${profileId.substring(0, 3)}...`,
    },
    "Inserted consent for user",
  );

  const { rows: profileRows } = await updateConsentStatuses({
    profileId,
    client,
    consentInput,
  });

  if (!profileRows || profileRows.length === 0) {
    throw httpErrors.internalServerError(
      "Not have been able to update consent",
    );
  }

  logger.debug(
    { userId: `${profileId.substring(0, 3)}...` },
    "Updated consent statuses for user",
  );

  return consentRows[0];
}

async function executeSubmitConsent(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  consentInput: CitizenSubmitConsentBody;
  profile: ProfileWithLinkedProfiles;
  reason: CascadeConsentReason;
}): Promise<{ id: string }> {
  const { profile } = params;

  // Validate that the statement is the current active statement for the subject
  try {
    const currentStatement = await getCurrentConsentStatement({
      client: params.client,
      subject: params.consentInput.subject,
    });

    if (currentStatement.id !== params.consentInput.consentStatementId) {
      throw httpErrors.badRequest(
        `Statement is not the current active statement for subject '${params.consentInput.subject}'`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("No consent statement found for this subject")
    ) {
      throw httpErrors.badRequest(
        "No current active statement found for this subject",
      );
    }
    throw error;
  }

  const consentId = await insertConsentAndUpdateStatuses(
    params.client,
    profile.id,
    params.consentInput,
    params.logger,
  );

  if (profile.linkedProfiles && profile.linkedProfiles.length > 0) {
    params.logger.debug(
      {
        userId: `${profile.id.substring(0, 3)}...`,
        linkedProfilesLength: profile.linkedProfiles.length,
      },
      "Updating consent for linked profiles",
    );
    for (const lp of profile.linkedProfiles) {
      await executeInsertConsentQuery(
        params.client,
        lp.id,
        params.consentInput,
        {
          reason: params.reason,
          sourceProfileId: profile.id,
        },
      );
      await updateConsentStatuses({
        profileId: lp.id,
        client: params.client,
        consentInput: params.consentInput,
      });
    }

    // Enhanced audit trail for consent cascade
    params.logger.info(
      {
        primaryUserId: `${profile.id.substring(0, 3)}...`,
        linkedProfilesCount: profile.linkedProfiles.length,
        consentSubject: params.consentInput.subject,
        consentStatus: params.consentInput.status,
        cascadeReason: "explicit_consent_submission",
        linkedProfileIds: profile.linkedProfiles.map(
          (lp) => `${lp.id.substring(0, 3)}...`,
        ),
      },
      "Consent cascade completed for linked profiles",
    );
  }

  return { id: consentId.id };
}

/**
 * Submit multiple consents for a user with comprehensive validation.
 *
 * This function is designed for user-facing API endpoints and includes:
 * - Statement existence validation
 * - Current statement version validation
 * - Status transition validation
 * - Detailed error reporting
 *
 * Use this for:
 * - User consent submissions via API endpoints
 * - Operations that require strict validation
 *
 * For internal operations (webhooks, imports), use submitConsent instead.
 */
export async function submitConsents(
  params: {
    consentInput: CitizenSubmitConsentsBody;
    logger: FastifyBaseLogger;
  } & (
    | { userId: string }
    | {
        profile: Omit<ProfileWithLinkedProfiles, "linkedProfiles"> & {
          linkedProfiles: LinkedProfile[];
        };
      }
  ) &
    ({ pool: Pool } | { client: PoolClient }),
): Promise<CitizenSubmitConsentsResponse> {
  const profile = await getProfileForConsent(params);

  if (profile.id !== profile.primaryUserId) {
    throw httpErrors.badRequest("Cannot submit consent for a child profile");
  }

  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeSubmitConsents({
          client,
          profile,
          logger: params.logger,
          consentInput: params.consentInput,
        });
      }),
    );
  }

  return executeSubmitConsents({
    client: params.client,
    profile,
    logger: params.logger,
    consentInput: params.consentInput,
  });
}

async function validateConsents(
  client: PoolClient,
  profile: ProfileWithLinkedProfiles,
  consents: CitizenSubmitConsentsBody["consents"],
): Promise<
  Array<{
    subject: string;
    consentStatementId: string;
    errors: string[];
  }>
> {
  const validationErrors: Array<{
    subject: string;
    consentStatementId: string;
    errors: string[];
  }> = [];

  for (const consent of consents) {
    const errors: string[] = [];

    // Validate current statement check and statement existence
    try {
      const currentStatement = await getCurrentConsentStatement({
        client,
        subject: consent.subject,
      });

      if (currentStatement.id !== consent.consentStatementId) {
        errors.push(
          `Statement is not the current active statement for subject '${consent.subject}'`,
        );
      }
    } catch {
      errors.push(
        `No current active statement found for subject '${consent.subject}'`,
      );
    }

    // Validate status transitions
    try {
      const currentConsent = await getLatestConsentForUser({
        client,
        userId: profile.id,
        subject: consent.subject,
      });

      if (
        currentConsent &&
        !isValidStatusTransition(currentConsent.status, consent.status)
      ) {
        errors.push(
          `Invalid status transition from '${currentConsent.status}' to '${consent.status}'`,
        );
      }
    } catch (error) {
      // If user has no consents, that's fine - they can submit their first consent
      if (
        error instanceof Error &&
        error.message.includes("User has not consents")
      ) {
        // This is expected for first-time consent submission
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    if (errors.length > 0) {
      validationErrors.push({
        subject: consent.subject,
        consentStatementId: consent.consentStatementId,
        errors,
      });
    }
  }

  return validationErrors;
}

async function processPrimaryProfileConsents(
  client: PoolClient,
  profile: ProfileWithLinkedProfiles,
  consents: CitizenSubmitConsentsBody["consents"],
  logger: FastifyBaseLogger,
): Promise<
  Array<{
    id: string;
    subject: string;
    status: ConsentStatus;
    submittedAt: string;
    consentStatementId: string;
    statementVersion: number;
    isLatestStatement: boolean;
  }>
> {
  const results: Array<{
    id: string;
    subject: string;
    status: ConsentStatus;
    submittedAt: string;
    consentStatementId: string;
    statementVersion: number;
    isLatestStatement: boolean;
  }> = [];

  for (const consent of consents) {
    const { rows: consentRows } = await executeInsertConsentQuery(
      client,
      profile.id,
      {
        subject: consent.subject,
        status: consent.status,
        consentStatementId: consent.consentStatementId,
      },
    );

    if (!consentRows || consentRows.length === 0) {
      throw httpErrors.internalServerError(
        `Failed to insert consent for subject '${consent.subject}'`,
      );
    }

    // Update profile consent statuses
    await updateConsentStatuses({
      profileId: profile.id,
      client,
      consentInput: {
        subject: consent.subject,
        status: consent.status,
        consentStatementId: consent.consentStatementId,
      },
    });

    // Get statement details for response
    const statement = await getCurrentConsentStatement({
      client,
      subject: consent.subject,
    });

    results.push({
      id: consentRows[0].id,
      subject: consent.subject,
      status: consent.status,
      submittedAt: new Date().toISOString(),
      consentStatementId: consent.consentStatementId,
      statementVersion: statement.version,
      isLatestStatement: true, // Since we validated it's the current statement
    });

    logger.debug(
      {
        consent_id: consentRows[0].id,
        subject: consent.subject,
        userId: `${profile.id.substring(0, 3)}...`,
      },
      "Inserted consent for user",
    );
  }

  return results;
}

async function processLinkedProfiles(
  client: PoolClient,
  linkedProfiles: LinkedProfile[],
  consents: CitizenSubmitConsentsBody["consents"],
  sourceProfileId: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  if (!linkedProfiles || linkedProfiles.length === 0) {
    return;
  }

  logger.debug(
    {
      userId: `${sourceProfileId.substring(0, 3)}...`,
      linkedProfilesLength: linkedProfiles.length,
    },
    "Updating consent for linked profiles",
  );

  // Process all linked profiles in parallel
  await Promise.all(
    linkedProfiles.map(async (lp) => {
      // Process all consents for this linked profile in parallel
      await Promise.all(
        consents.map(async (consent) => {
          const [insertResult, updateResult] = await Promise.all([
            executeInsertConsentQuery(
              client,
              lp.id,
              {
                subject: consent.subject,
                status: consent.status,
                consentStatementId: consent.consentStatementId,
              },
              {
                reason: "explicit_consent_submission",
                sourceProfileId,
              },
            ),
            updateConsentStatuses({
              profileId: lp.id,
              client,
              consentInput: {
                subject: consent.subject,
                status: consent.status,
                consentStatementId: consent.consentStatementId,
              },
            }),
          ]);

          return { insertResult, updateResult };
        }),
      );
    }),
  );

  logger.info(
    {
      primaryUserId: `${sourceProfileId.substring(0, 3)}...`,
      linkedProfilesCount: linkedProfiles.length,
      consentSubjects: consents.map((c) => c.subject),
      cascadeReason: "explicit_consent_submission",
      linkedProfileIds: linkedProfiles.map(
        (lp) => `${lp.id.substring(0, 3)}...`,
      ),
    },
    "Consent cascade completed for linked profiles",
  );
}

async function executeSubmitConsents(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  consentInput: CitizenSubmitConsentsBody;
  profile: ProfileWithLinkedProfiles;
}): Promise<CitizenSubmitConsentsResponse> {
  const { profile, client, logger, consentInput } = params;

  // Validate all consents before processing
  const validationErrors = await validateConsents(
    client,
    profile,
    consentInput.consents,
  );

  // If there are validation errors, return them without processing
  if (validationErrors.length > 0) {
    return {
      data: [],
      errors: validationErrors,
    };
  }

  // Process primary profile consents
  const results = await processPrimaryProfileConsents(
    client,
    profile,
    consentInput.consents,
    logger,
  );

  // Handle linked profiles if any
  await processLinkedProfiles(
    client,
    profile.linkedProfiles || [],
    consentInput.consents,
    profile.id,
    logger,
  );

  return { data: results };
}

export async function getLatestConsentForUsers({
  pool,
  paginationParams,
  subject,
  organisationId,
}: {
  pool: Pool;
  paginationParams: Required<PaginationParams>;
  subject: string;
  organisationId: string;
}): Promise<{ data: ConsentWithStatement[]; totalCount: number }> {
  return withClient(pool, async (client) => {
    const { rows: rowsCount } = await client.query<{ count: number }>(
      `
        SELECT COUNT(DISTINCT c.profile_id)
        FROM profile_consents c
        INNER JOIN profile_details d ON c.profile_id = d.profile_id
        WHERE c.subject = $1
          AND d.organisation_id = $2
          AND d.is_latest = TRUE
      `,
      [subject, organisationId],
    );

    if (!rowsCount[0] || Number(rowsCount[0].count ?? 0) === 0) {
      return { data: [], totalCount: 0 };
    }
    const totalCount = Number(rowsCount[0].count);
    const { rows } = await client.query<
      Consent & {
        version: number;
        cascadeReason: string | null;
        cascadeSourceProfileId: string | null;
        sourceProfileEmail: string | null;
        targetProfileEmail: string | null;
      }
    >(
      `
        SELECT DISTINCT ON (c.profile_id)
          c.id,
          c.profile_id as "profileId",
          c.subject,
          c.status,
          c.created_at as "createdAt",
          c.consent_statement_id as "consentStatementId",
          cs.version,
          c.cascade_reason as "cascadeReason",
          c.cascade_source_profile_id as "cascadeSourceProfileId",
          source_profile.email as "sourceProfileEmail",
          target_profile.email as "targetProfileEmail"
        FROM profile_consents c
        JOIN consent_statements cs ON cs.id = c.consent_statement_id
        LEFT JOIN profiles source_profile ON c.cascade_source_profile_id = source_profile.id
        LEFT JOIN profiles target_profile ON c.profile_id = target_profile.id
        INNER JOIN profile_details d
            ON c.profile_id = d.profile_id
        WHERE
            c.subject = $1
            AND d.organisation_id = $2
            AND d.is_latest = TRUE
        ORDER BY c.profile_id, c.created_at DESC
        LIMIT $3::integer OFFSET $4::integer;
      `,
      [
        subject,
        organisationId,
        paginationParams.limit,
        paginationParams.offset,
      ],
    );

    const transformedResults: ConsentWithStatement[] = rows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      subject: row.subject,
      status: row.status,
      createdAt: row.createdAt,
      consentStatementId: row.consentStatementId,
      consentStatement: {
        version: row.version,
      },
      cascadeReason: row.cascadeReason,
      cascadeSourceProfileId: row.cascadeSourceProfileId,
      sourceProfileEmail: row.sourceProfileEmail,
      targetProfileEmail: row.targetProfileEmail,
    }));

    return { data: transformedResults, totalCount };
  });
}

export async function propagateConsentOnAccountLinking(
  params: {
    client: PoolClient;
    logger: FastifyBaseLogger;
    currentConsentStatement: ConsentStatementWithTranslations;
    reason: CascadeConsentReason;
  } & (
    | { primaryProfileId: string; primaryProfile?: undefined }
    | {
        primaryProfile: ProfileWithLinkedProfiles;
        primaryProfileId?: undefined;
      }
  ) &
    (
      | { childProfileId: string; childProfile?: undefined }
      | { childProfile: ProfileWithLinkedProfiles; childProfileId?: undefined }
    ),
): Promise<void> {
  const { client, logger, currentConsentStatement } = params;
  try {
    logger.info("About to get primary profile...");
    // Check if both profiles exist before attempting cascade
    const primaryProfile =
      params.primaryProfile ??
      (await getProfile({
        organizationId: undefined,
        profileId: params.primaryProfileId,
        client,
        addLinkedProfiles: true,
        consentSubjects: [],
      }));

    logger.info("About to get linked profile...");
    const linkedProfile =
      params.childProfile ??
      (await getProfile({
        organizationId: undefined,
        profileId: params.childProfileId,
        client,
        addLinkedProfiles: true,
        consentSubjects: [],
      }));

    if (primaryProfile.id !== primaryProfile.primaryUserId) {
      logger.warn(
        `Skipping cascade consent for primary user ${primaryProfile.id} as it is a child profile`,
      );
      return;
    }

    // For linked profile, it might already be linked to the primary user, which is expected
    // We only skip if it's linked to a different user than the primary user
    if (linkedProfile.primaryUserId !== primaryProfile.id) {
      logger.warn(
        `Skipping cascade consent for linked user ${linkedProfile.id} as it is linked to a different user (${linkedProfile.primaryUserId}) than the primary user (${primaryProfile.id})`,
      );
      return;
    }

    const isPrimaryConsentSet = await isLatestConsentSet({
      client,
      subject: currentConsentStatement.subject,
      userId: primaryProfile.id,
    });

    if (!isPrimaryConsentSet) {
      await submitConsent({
        client,
        logger,
        reason: params.reason,
        consentInput: {
          subject: currentConsentStatement.subject,
          consentStatementId: currentConsentStatement.id,
          status: ConsentStatuses.Undefined,
        },
        profile: primaryProfile as ProfileWithLinkedProfiles & {
          linkedProfiles: LinkedProfile[];
        },
      });
      // Submit consent already handles cascade to linked profiles
      logger.info(
        `Submitted undefined consent for primary user ${primaryProfile.id} on subject ${currentConsentStatement.subject}`,
      );
      return;
    }
    const primaryLatestConsent = await getLatestConsentForUser({
      client,
      userId: primaryProfile.id,
      subject: currentConsentStatement.subject,
    });

    if (
      await alreadyPropagatedConsent({
        client,
        primaryProfileId: primaryProfile.id,
        linkedProfileId: linkedProfile.id,
        subject: primaryLatestConsent.subject,
        consentStatementId: primaryLatestConsent.id,
        reason: params.reason,
      })
    ) {
      logger.info(
        `Account linking cascade already processed for linked profile ${linkedProfile.id} from primary ${primaryProfile.id} with statement ${currentConsentStatement.id}, skipping`,
      );
      return;
    }

    await executeInsertConsentQuery(
      client,
      linkedProfile.id,
      {
        subject: primaryLatestConsent.subject,
        status: primaryLatestConsent.status,
        consentStatementId: primaryLatestConsent.consentStatementId,
      },
      {
        reason: params.reason,
        sourceProfileId: primaryProfile.id,
      },
    );
    await updateConsentStatuses({
      profileId: linkedProfile.id,
      client,
      consentInput: {
        subject: primaryLatestConsent.subject,
        status: primaryLatestConsent.status,
        consentStatementId: primaryLatestConsent.consentStatementId,
      },
    });
  } catch (error) {
    const primaryUserId =
      params.primaryProfileId ?? params.primaryProfile?.id ?? "unknown";
    const linkedProfileId =
      params.childProfileId ?? params.childProfile?.id ?? "unknown";
    // If profiles don't exist yet, skip cascade - it will be handled later when profiles are created
    logger.error(
      { error },
      `Error in cascadeConsentOnAccountLinking for primary user ${primaryUserId} and linked user ${linkedProfileId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );

    throw error; // These are critical errors that should fail the transaction
  }
}

async function alreadyPropagatedConsent(params: {
  client: PoolClient;
  primaryProfileId: string;
  linkedProfileId: string;
  subject: ConsentSubject;
  consentStatementId: string;
  reason: CascadeConsentReason;
}): Promise<boolean> {
  const { rows: existingCascade } = await params.client.query(
    `SELECT id 
      FROM profile_consents 
      WHERE profile_id = $1 
        AND subject = $2 
        AND cascade_reason = $3 
        AND cascade_source_profile_id = $4 
        AND consent_statement_id = $5
    `,
    [
      params.linkedProfileId,
      params.subject,
      params.reason,
      params.primaryProfileId,
      params.consentStatementId,
    ],
  );

  return existingCascade.length > 0;
}

async function isLatestConsentSet(params: {
  client: PoolClient;
  subject: ConsentSubject;
  userId: string;
}): Promise<boolean> {
  try {
    await getLatestConsentForUser(params);
    return true;
  } catch (e) {
    if (typeof e === "object" && e?.constructor.name === "NotFoundError") {
      return false;
    }
    throw e;
  }
}

/* ---- Support user specific service ---- */

export async function submitSupportConsents(
  params: {
    consentInput: SupportSubmitConsentsBody;
    logger: FastifyBaseLogger;
  } & (
    | { userId: string }
    | {
        profile: Omit<ProfileWithLinkedProfiles, "linkedProfiles"> & {
          linkedProfiles: LinkedProfile[];
        };
      }
  ) &
    ({ pool: Pool } | { client: PoolClient }),
): Promise<SupportSubmitConsentsResponse> {
  const profile = await getProfileForConsent(params);

  if (profile.id !== profile.primaryUserId) {
    throw httpErrors.badRequest("Cannot submit consent for a child profile");
  }

  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeSupportSubmitConsents({
          client,
          profile,
          logger: params.logger,
          consentInput: params.consentInput,
        });
      }),
    );
  }

  return executeSupportSubmitConsents({
    client: params.client,
    profile,
    logger: params.logger,
    consentInput: params.consentInput,
  });
}

async function validateSupportConsents(
  client: PoolClient,
  consents: SupportSubmitConsentsBody["consents"],
): Promise<
  {
    subject: string;
    consentStatementId: string;
    status: ConsentStatus;
  }[]
> {
  const output: {
    subject: string;
    consentStatementId: string;
    status: ConsentStatus;
  }[] = [];

  for (const consent of consents) {
    let consentStatement: ConsentStatementWithTranslations | undefined;
    try {
      consentStatement = await getCurrentConsentStatement({
        client,
        subject: consent.subject,
      });
      output.push({
        subject: consent.subject,
        consentStatementId: consentStatement.id,
        status: consent.status,
      });
    } catch {
      throw httpErrors.badRequest(
        `No current active statement found for subject '${consent.subject}'`,
      );
    }
  }

  return output;
}

async function executeSupportSubmitConsents(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  consentInput: SupportSubmitConsentsBody;
  profile: ProfileWithLinkedProfiles;
}): Promise<SupportSubmitConsentsResponse> {
  const { profile, client, logger, consentInput } = params;

  const subjectWithStatements = await validateSupportConsents(
    client,
    consentInput.consents,
  );

  // Process primary profile consents
  const results = await processPrimaryProfileConsents(
    client,
    profile,
    subjectWithStatements,
    logger,
  );

  // Handle linked profiles if any
  await processLinkedProfiles(
    client,
    profile.linkedProfiles || [],
    subjectWithStatements,
    profile.id,
    logger,
  );

  return { data: results };
}
