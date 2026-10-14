import { httpErrors } from "@fastify/sensible";
import type { FastifyBaseLogger } from "fastify";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type {
  CreateConsentStatement,
  CreateStatementTranslationsMap,
  UpdateConsentStatement,
} from "~/schemas/consent-statements/organisation.js";
import type {
  ConsentStatement,
  ConsentStatementLanguage,
  ConsentStatementTranslation,
  ConsentStatementWithTranslations,
} from "~/schemas/consent-statements/shared.js";
import {
  type ConsentSubject,
  ConsentSubjects,
} from "~/schemas/consents/shared.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import { consentStatementServiceFromPool } from "~/services/consent-statements/consent-statement-service.js";
import { withClient } from "~/utils/with-client.js";
import { withRollback } from "~/utils/with-rollback.js";

const consentStatementBaseQuery = `
  SELECT 
    cs.id,
    cs.subject,
    cs.version,
    cs.created_at as "createdAt",
    cs.publish_date as "publishDate",
    cs.is_enabled as "isEnabled",
    cs.created_by as "createdBy"
  FROM consent_statements cs
`;

const consentStatementTranslationBaseQuery = `
  SELECT 
    cst.id,
    cst.consent_statement_id as "consentStatementId",
    cst.language,
    cst.description,
    cst.disclaimer,
    cst.title,
    cst.created_at as "createdAt"
  FROM consent_statement_translations cst
`;

type BooleanCreateConsentStatement = Omit<
  CreateConsentStatement,
  "isEnabled"
> & { isEnabled: boolean };

type BooleanUpdateConsentStatement = Omit<
  UpdateConsentStatement,
  "isEnabled"
> & { isEnabled: boolean };

export async function createConsentStatement(
  params: {
    consentStatement: BooleanCreateConsentStatement;
    logger: FastifyBaseLogger;
    loggedInUserId: string | null;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<{ id: string; version: number }> {
  if (Object.keys(params.consentStatement.translations).length === 0) {
    throw httpErrors.badRequest("At least one translation must be set");
  }
  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeCreateConsentStatement({
          client,
          logger: params.logger,
          consentStatement: params.consentStatement,
          loggedInUserId: params.loggedInUserId,
        });
      }),
    );
  }

  return executeCreateConsentStatement(params);
}

async function executeCreateConsentStatement(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  loggedInUserId: string | null;
  consentStatement: BooleanCreateConsentStatement;
}): Promise<{ id: string; version: number }> {
  await ensurePublishDateIsValid({
    publishDate: params.consentStatement.publishDate,
    alreadyExistentPublishDate: null,
    client: params.client,
    subject: params.consentStatement.subject,
  });
  const version = await getNewVersionForSubject({
    client: params.client,
    subject: params.consentStatement.subject,
  });

  const { rows: statementRows } = await params.client.query<{
    id: string;
    version: number;
  }>(
    `
    INSERT INTO consent_statements(subject, version, publish_date, is_enabled, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, version;
    `,
    [
      params.consentStatement.subject,
      version,
      params.consentStatement.publishDate,
      params.consentStatement.isEnabled,
      params.loggedInUserId,
    ],
  );

  if (!statementRows || statementRows.length === 0) {
    throw httpErrors.internalServerError("Unable to create consent statement");
  }

  const statementId = statementRows[0].id;
  const statementVersion = Number(statementRows[0].version);
  params.logger.debug({ statementId }, "Created consent statement");

  const translations = params.consentStatement.translations;

  if (!translations.ga) {
    translations.ga = translations.en;
  }
  if (!translations.en) {
    translations.en = translations.ga;
  }

  const translationPromises = insertTranslations(
    translations,
    statementId,
    params.client,
  );

  try {
    await Promise.all(translationPromises);
    params.logger.debug(
      { statementId, translationsCount: translationPromises.length },
      "Created consent statement translations",
    );
  } catch {
    throw httpErrors.internalServerError(
      "Unable to create consent statement translations",
    );
  }

  return { id: statementId, version: statementVersion };
}

async function ensurePublishDateIsValid(params: {
  publishDate: string;
  alreadyExistentPublishDate: string | null;
  client: PoolClient;
  subject: string;
}): Promise<void> {
  const now = new Date();
  if (
    params.alreadyExistentPublishDate &&
    new Date(params.alreadyExistentPublishDate) < now
  ) {
    throw httpErrors.unprocessableEntity(
      "Cannot update an already published consent statement",
    );
  }

  const { rows } = await params.client.query<{ count: number }>(
    `
    SELECT COUNT(*) as "count"
    FROM consent_statements
    WHERE subject = $1 AND publish_date = $2
    `,
    [params.subject, params.publishDate],
  );

  if (rows[0].count > 0) {
    throw httpErrors.conflict(
      "Consent statement with the same subject and publish date already exists",
    );
  }

  const publishDate = new Date(params.publishDate);
  if (publishDate < now) {
    throw httpErrors.unprocessableEntity(
      "Invalid publish date, cannot be in the past",
    );
  }
}

async function getNewVersionForSubject(params: {
  client: PoolClient;
  subject: string;
}): Promise<number> {
  const { rows } = await params.client.query<{ maxVersion: number }>(
    `
    SELECT COALESCE(MAX(version), 0) AS "maxVersion"
    FROM consent_statements
    WHERE subject = $1;
  `,
    [params.subject],
  );

  if (rows.length === 0 || rows[0].maxVersion === null) {
    return 1;
  }

  return Number(rows[0].maxVersion) + 1;
}

export async function updateConsentStatement(
  params: {
    id: string;
    consentStatement: BooleanUpdateConsentStatement;
    logger: FastifyBaseLogger;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<void> {
  if (Object.keys(params.consentStatement.translations).length === 0) {
    throw httpErrors.badRequest("At least one translation must be set");
  }

  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeUpdateConsentStatement({
          client,
          logger: params.logger,
          id: params.id,
          consentStatement: params.consentStatement,
        });
      }),
    );
  }

  return executeUpdateConsentStatement({
    client: params.client,
    logger: params.logger,
    id: params.id,
    consentStatement: params.consentStatement,
  });
}

async function executeUpdateConsentStatement(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  id: string;
  consentStatement: BooleanUpdateConsentStatement;
}): Promise<void> {
  const statementFromDb = await getConsentStatementById(params);
  await ensurePublishDateIsValid({
    publishDate: params.consentStatement.publishDate,
    alreadyExistentPublishDate: statementFromDb.publishDate,
    client: params.client,
    subject: params.consentStatement.subject,
  });
  const { rows: statementRows } = await params.client.query<{ id: string }>(
    `
    UPDATE consent_statements
    SET publish_date = $1, is_enabled = $2, subject = $3
    WHERE id = $4
    RETURNING id;
    `,
    [
      params.consentStatement.publishDate,
      params.consentStatement.isEnabled,
      params.consentStatement.subject,
      params.id,
    ],
  );
  if (statementRows.length === 0) {
    throw httpErrors.notFound("Consent statement not found");
  }

  const translations = params.consentStatement.translations;
  if (!translations.ga) {
    translations.ga = translations.en;
  }
  if (!translations.en) {
    translations.en = translations.ga;
  }

  await deleteTranslationsForStatement(params.id, params.client);
  const translationPromises = insertTranslations(
    translations,
    params.id,
    params.client,
  );

  try {
    await Promise.all(translationPromises);
    params.logger.debug(
      { statementId: params.id, translationsCount: translationPromises.length },
      "Updated consent statement translations",
    );
  } catch {
    throw httpErrors.internalServerError(
      "Unable to update consent statement translations",
    );
  }
}

function insertTranslations(
  translations: CreateStatementTranslationsMap,
  statementId: string,
  client: PoolClient,
): Promise<QueryResult<QueryResultRow>>[] {
  return Object.entries(translations).map(([language, translation]) =>
    client.query(
      `
        INSERT INTO consent_statement_translations(
          consent_statement_id,
          language,
          title,
          description,
          disclaimer
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
        `,
      [
        statementId,
        language,
        translation.title,
        translation.description,
        translation.disclaimer,
      ],
    ),
  );
}

function deleteTranslationsForStatement(
  statementId: string,
  client: PoolClient,
): Promise<QueryResult<QueryResultRow>> {
  return client.query(
    `
      DELETE FROM consent_statement_translations
      WHERE consent_statement_id = $1
    `,
    [statementId],
  );
}

export async function getConsentStatementById(
  params: {
    id: string;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<ConsentStatementWithTranslations> {
  if ("pool" in params) {
    return consentStatementServiceFromPool(params.pool).getById(params.id);
  }
  return executeGetConsentStatement({
    client: params.client,
    id: params.id,
  });
}

export async function getCurrentConsentStatement(
  params: {
    subject: string;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<ConsentStatementWithTranslations> {
  if ("pool" in params) {
    return consentStatementServiceFromPool(params.pool).getCurrent(
      params.subject,
    );
  }
  return executeGetConsentStatement({
    client: params.client,
    subject: params.subject,
  });
}

export async function getCurrentConsentStatements(
  params: {
    subjects: string[];
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<ConsentStatementWithTranslations[]> {
  if ("pool" in params) {
    return consentStatementServiceFromPool(params.pool).getCurrentMany(
      params.subjects,
    );
  }
  return executeGetCurrentConsentStatementForSubjects({
    client: params.client,
    subjects: params.subjects,
  });
}

async function executeGetCurrentConsentStatementForSubjects(params: {
  client: PoolClient;
  subjects: string[];
}): Promise<ConsentStatementWithTranslations[]> {
  if (params.subjects.length === 0) {
    return [];
  }
  // TODO Optimize this code to do a lower number of queries
  const { rows: statementRows } = await params.client.query<ConsentStatement>(
    `
      SELECT DISTINCT ON (cs.subject)
        cs.id,
        cs.subject,
        cs.version,
        cs.created_at as "createdAt",
        cs.publish_date as "publishDate",
        cs.is_enabled as "isEnabled",
        cs.created_by as "createdBy"
      FROM consent_statements cs 
      WHERE cs.subject = ANY($1) AND publish_date <= NOW() AND is_enabled = true
      ORDER BY cs.subject, cs.publish_date DESC;
    `,
    [params.subjects],
  );
  if (statementRows.length === 0) {
    return [];
  }

  const { rows: translationRows } =
    await params.client.query<ConsentStatementTranslation>(
      `
      ${consentStatementTranslationBaseQuery}
      WHERE consent_statement_id = ANY($1)
    `,
      [statementRows.map((row) => row.id)],
    );

  if (!translationRows || translationRows.length === 0) {
    throw httpErrors.notFound(
      "No translations found for these consent statement",
    );
  }

  const translations = translationRows.reduce<
    Record<
      string,
      Record<ConsentStatementLanguage, ConsentStatementTranslation>
    >
  >(
    (acc, translation) => {
      if (!acc[translation.consentStatementId]) {
        acc[translation.consentStatementId] = {} as Record<
          ConsentStatementLanguage,
          ConsentStatementTranslation
        >;
      }
      acc[translation.consentStatementId][translation.language] = translation;
      return acc;
    },
    {} as Record<
      string,
      Record<ConsentStatementLanguage, ConsentStatementTranslation>
    >,
  );

  const output = statementRows.map((statement) => {
    const currentTranslations = translations[statement.id] || {};
    return {
      ...statement,
      version: Number(statement.version),
      translations: currentTranslations,
    };
  });

  return output;
}

async function executeGetConsentStatement(
  params: {
    client: PoolClient;
  } & (
    | { subject: string; version: number }
    | { subject: string }
    | { id: string }
  ),
): Promise<ConsentStatementWithTranslations> {
  const values: (string | number)[] = [];
  let whereClauses = "";

  if ("version" in params) {
    values.push(params.version);
    values.push(params.subject.trim());
    whereClauses = "version = $1 AND subject = $2";
  } else if ("subject" in params) {
    values.push(params.subject.trim());
    whereClauses =
      "subject = $1 AND publish_date <= NOW() AND is_enabled = true";
  } else if ("id" in params) {
    values.push(params.id.trim());
    whereClauses = "id = $1";
  }

  if (whereClauses.length === 0) {
    throw httpErrors.badRequest("Invalid parameters");
  }

  const { rows: statementRows } = await params.client.query<ConsentStatement>(
    `
      ${consentStatementBaseQuery}
      WHERE ${whereClauses}
      ORDER BY publish_date DESC, version DESC, created_at DESC
      LIMIT 1;
    `,
    values,
  );

  if (!statementRows || statementRows.length === 0) {
    throw httpErrors.notFound("No consent statement found for this subject");
  }

  const statement = statementRows[0];

  const { rows: translationRows } =
    await params.client.query<ConsentStatementTranslation>(
      `
      ${consentStatementTranslationBaseQuery}
      WHERE consent_statement_id = $1
    `,
      [statement.id],
    );

  if (!translationRows || translationRows.length === 0) {
    throw httpErrors.notFound(
      "No translations found for this consent statement",
    );
  }

  const translations = translationRows.reduce<
    Record<ConsentStatementLanguage, ConsentStatementTranslation>
  >(
    (acc, translation) => {
      acc[translation.language] = translation;
      return acc;
    },
    {} as Record<ConsentStatementLanguage, ConsentStatementTranslation>,
  );

  return {
    ...statement,
    version: Number(statement.version),
    translations,
  };
}

export async function listConsentStatements(
  params: {
    subject?: string;
    isEnabled?: boolean;
    pagination: Required<PaginationParams>;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<{ data: ConsentStatement[]; totalCount: number }> {
  if ("pool" in params) {
    return consentStatementServiceFromPool(params.pool).list({
      subject: params.subject,
      isEnabled: params.isEnabled,
      pagination: params.pagination,
    });
  }
  return executeListConsentStatements({
    client: params.client,
    subject: params.subject,
    isEnabled: params.isEnabled,
    pagination: params.pagination,
  });
}

async function executeListConsentStatements(params: {
  client: PoolClient;
  subject?: string;
  isEnabled?: boolean;
  pagination: Required<PaginationParams>;
}): Promise<{ data: ConsentStatement[]; totalCount: number }> {
  let values: (string | number | boolean)[] = [];
  let whereIndex = 1;
  let whereClauses = "1=1";
  if (params.subject) {
    whereClauses = `${whereClauses} AND subject = $${whereIndex}`;
    values.push(params.subject);
    whereIndex++;
  }
  if (params.isEnabled !== undefined) {
    whereClauses = `${whereClauses} AND is_enabled = $${whereIndex}`;
    values.push(params.isEnabled);
    whereIndex++;
  }

  const { rows: statementsCount } = await params.client.query<{
    count: number;
  }>(
    `
    SELECT COUNT(*) as count
    FROM consent_statements
    WHERE ${whereClauses}
  `,
    values,
  );

  values = [...values, params.pagination.limit, params.pagination.offset];

  const totalCount =
    statementsCount.length === 0 ||
    statementsCount[0].count === null ||
    Number(statementsCount[0].count) === 0
      ? 0
      : Number(statementsCount[0].count);

  if (totalCount === 0) {
    return {
      data: [],
      totalCount: 0,
    };
  }

  const query = `
      ${consentStatementBaseQuery}
      WHERE ${whereClauses}
      ORDER BY publish_date DESC, version DESC, created_at DESC
      LIMIT $${whereIndex++}::integer OFFSET $${whereIndex++}::integer;
    `;
  const { rows: statementRows } = await params.client.query<ConsentStatement>(
    query,
    values,
  );

  return {
    data: statementRows,
    totalCount,
  };
}

export async function disableConsentStatement(
  params: {
    id: string;
    logger: FastifyBaseLogger;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<ConsentStatementWithTranslations> {
  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeDisableConsentStatement({
          client,
          logger: params.logger,
          id: params.id,
        });
      }),
    );
  }

  return executeDisableConsentStatement(params);
}

async function executeDisableConsentStatement(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  id: string;
}): Promise<ConsentStatementWithTranslations> {
  // First check if the consent statement exists
  const { rows: statementRows } = await params.client.query<ConsentStatement>(
    `
      ${consentStatementBaseQuery}
      WHERE id = $1
    `,
    [params.id],
  );

  if (!statementRows || statementRows.length === 0) {
    throw httpErrors.notFound("Consent statement not found");
  }

  // Update the consent statement to disable it
  const { rows: updatedRows } = await params.client.query<ConsentStatement>(
    `
      UPDATE consent_statements
      SET is_enabled = false
      WHERE id = $1
      RETURNING id, subject, version, created_at as "createdAt", publish_date as "publishDate", is_enabled as "isEnabled", created_by as "createdBy"
    `,
    [params.id],
  );

  if (!updatedRows || updatedRows.length === 0) {
    throw httpErrors.internalServerError("Failed to disable consent statement");
  }

  const updatedStatement = updatedRows[0];

  // Get the translations for the updated statement
  const { rows: translationRows } =
    await params.client.query<ConsentStatementTranslation>(
      `
        ${consentStatementTranslationBaseQuery}
        WHERE consent_statement_id = $1
      `,
      [params.id],
    );

  if (!translationRows || translationRows.length === 0) {
    throw httpErrors.notFound(
      "No translations found for this consent statement",
    );
  }

  const translations = translationRows.reduce<
    Record<ConsentStatementLanguage, ConsentStatementTranslation>
  >(
    (acc, translation) => {
      acc[translation.language] = translation;
      return acc;
    },
    {} as Record<ConsentStatementLanguage, ConsentStatementTranslation>,
  );

  params.logger.debug({ statementId: params.id }, "Disabled consent statement");

  return {
    ...updatedStatement,
    version: Number(updatedStatement.version),
    translations,
  };
}

export async function getAvailableConsentSubjects(
  params: { pool: Pool } | { client: PoolClient },
): Promise<ConsentSubject[]> {
  if ("pool" in params) {
    return consentStatementServiceFromPool(params.pool).getAvailableSubjects();
  }

  const output = await executeGetAvailableConsentSubjects({
    client: params.client,
  });

  const validConsentSubjects = Object.values(
    ConsentSubjects as Record<string, string>,
  );

  return output.filter((subject) => validConsentSubjects.includes(subject));
}

async function executeGetAvailableConsentSubjects(params: {
  client: PoolClient;
}): Promise<string[]> {
  const { rows } = await params.client.query<{ subject: string }>(
    `
      SELECT DISTINCT subject
      FROM public.consent_statements
      WHERE publish_date <= NOW()
        AND is_enabled = TRUE;
    `,
  );

  return rows.map((row) => row.subject);
}
