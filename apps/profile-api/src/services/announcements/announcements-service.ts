import { httpErrors } from "@fastify/sensible";
import type { FastifyBaseLogger } from "fastify";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type {
  Announcement,
  AnnouncementLanguage,
  AnnouncementTranslation,
  AnnouncementWithTranslations,
} from "~/schemas/announcements/shared.js";
import type {
  CreateAnnouncement,
  UpdateAnnouncementEnabled,
} from "~/schemas/announcements/support.js";
import type { PaginationParams } from "~/schemas/pagination.js";
import { announcementServiceFromPool } from "~/services/announcements/announcement-service.js";
import { withClient } from "~/utils/with-client.js";
import { withRollback } from "~/utils/with-rollback.js";

const announcementBaseQuery = `
  SELECT
    a.id,
    a.application_id as "applicationId",
    a.is_enabled as "isEnabled",
    a.publish_date as "publishDate",
    a.created_at as "createdAt",
    a.created_by as "createdBy"
  FROM announcements a
`;

const announcementTranslationBaseQuery = `
  SELECT
    at.id,
    at.announcement_id as "announcementId",
    at.language,
    at.title,
    at.description,
    at.created_at as "createdAt"
  FROM announcement_translations at
`;

type BooleanCreateAnnouncement = Omit<CreateAnnouncement, "isEnabled"> & {
  isEnabled: boolean;
};

type BooleanUpdateAnnouncementEnabled = Omit<
  UpdateAnnouncementEnabled,
  "isEnabled"
> & {
  isEnabled: boolean;
};

export async function createAnnouncement(
  params: {
    announcement: BooleanCreateAnnouncement;
    logger: FastifyBaseLogger;
    loggedInUserId: string | null;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<{ id: string }> {
  if (
    !params.announcement.translations.en ||
    !params.announcement.translations.ga
  ) {
    throw httpErrors.badRequest("Both en and ga translations must be set");
  }

  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeCreateAnnouncement({
          client,
          logger: params.logger,
          announcement: params.announcement,
          loggedInUserId: params.loggedInUserId,
        });
      }),
    );
  }

  return executeCreateAnnouncement(params);
}

async function executeCreateAnnouncement(params: {
  client: PoolClient;
  logger: FastifyBaseLogger;
  announcement: BooleanCreateAnnouncement;
  loggedInUserId: string | null;
}): Promise<{ id: string }> {
  const { rows } = await params.client.query<{ id: string }>(
    `
      INSERT INTO announcements(application_id, is_enabled, publish_date, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [
      params.announcement.applicationId,
      params.announcement.isEnabled,
      params.announcement.publishDate,
      params.loggedInUserId,
    ],
  );

  if (rows.length === 0) {
    throw httpErrors.internalServerError("Unable to create announcement");
  }

  const announcementId = rows[0].id;
  const translationPromises = Object.entries(
    params.announcement.translations,
  ).map(([language, translation]) =>
    insertTranslation({
      client: params.client,
      announcementId,
      language,
      title: translation.title,
      description: translation.description,
    }),
  );

  try {
    await Promise.all(translationPromises);
    params.logger.debug(
      { announcementId, translationsCount: translationPromises.length },
      "Created announcement translations",
    );
  } catch (error) {
    params.logger.error(
      { announcementId, error },
      "Error creating announcement translations, rolling back announcement creation",
    );
    throw httpErrors.internalServerError(
      "Unable to create announcement translations",
    );
  }

  params.logger.debug({ announcementId }, "Created announcement");

  return { id: announcementId };
}

function insertTranslation(params: {
  client: PoolClient;
  announcementId: string;
  language: string;
  title: string;
  description: string;
}): Promise<QueryResult<QueryResultRow>> {
  return params.client.query(
    `
      INSERT INTO announcement_translations(
        announcement_id,
        language,
        title,
        description
      )
      VALUES ($1, $2, $3, $4);
    `,
    [params.announcementId, params.language, params.title, params.description],
  );
}

export async function getAnnouncementById(
  params: {
    id: string;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<AnnouncementWithTranslations> {
  if ("pool" in params) {
    return announcementServiceFromPool(params.pool).getById(params.id);
  }

  return executeGetAnnouncement({
    client: params.client,
    id: params.id,
  });
}

async function executeGetAnnouncement(params: {
  client: PoolClient;
  id: string;
}): Promise<AnnouncementWithTranslations> {
  const { rows: announcementRows } = await params.client.query<Announcement>(
    `
      ${announcementBaseQuery}
      WHERE a.id = $1
    `,
    [params.id],
  );

  if (announcementRows.length === 0) {
    throw httpErrors.notFound("Announcement not found");
  }

  const announcement = announcementRows[0];
  const translations = await getAnnouncementTranslations({
    client: params.client,
    announcementId: announcement.id,
  });

  return {
    ...announcement,
    translations,
  };
}

export async function listAnnouncements(
  params: {
    applicationId?: string;
    isEnabled?: boolean;
    pagination: Required<PaginationParams>;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<{ data: Announcement[]; totalCount: number }> {
  if ("pool" in params) {
    return announcementServiceFromPool(params.pool).list({
      applicationId: params.applicationId,
      isEnabled: params.isEnabled,
      pagination: params.pagination,
    });
  }

  return executeListAnnouncements({
    client: params.client,
    applicationId: params.applicationId,
    isEnabled: params.isEnabled,
    pagination: params.pagination,
  });
}

async function executeListAnnouncements(params: {
  client: PoolClient;
  applicationId?: string;
  isEnabled?: boolean;
  pagination: Required<PaginationParams>;
}): Promise<{ data: Announcement[]; totalCount: number }> {
  const values: (string | boolean)[] = [];
  let whereIndex = 1;
  let whereClauses = "1=1";

  if (params.applicationId) {
    whereClauses = `${whereClauses} AND a.application_id = $${whereIndex}`;
    values.push(params.applicationId);
    whereIndex++;
  }

  if (params.isEnabled !== undefined) {
    whereClauses = `${whereClauses} AND a.is_enabled = $${whereIndex}`;
    values.push(params.isEnabled);
    whereIndex++;
  }

  const { rows: countRows } = await params.client.query<{ count: number }>(
    `
      SELECT COUNT(*) as count
      FROM announcements a
      WHERE ${whereClauses}
    `,
    values,
  );

  const totalCount =
    countRows.length === 0 || countRows[0].count === null
      ? 0
      : Number(countRows[0].count);

  if (totalCount === 0) {
    return {
      data: [],
      totalCount: 0,
    };
  }

  const queryValues = [
    ...values,
    params.pagination.limit,
    params.pagination.offset,
  ];

  const { rows } = await params.client.query<Announcement>(
    `
      ${announcementBaseQuery}
      WHERE ${whereClauses}
      ORDER BY a.publish_date DESC, a.created_at DESC
      LIMIT $${whereIndex++}::integer OFFSET $${whereIndex++}::integer
    `,
    queryValues,
  );

  return {
    data: rows,
    totalCount,
  };
}

export async function listCitizenAnnouncements(
  params: {
    profileId: string;
    applicationId: string;
    newOnly: boolean;
    pagination: Required<PaginationParams>;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<{ data: AnnouncementWithTranslations[]; totalCount: number }> {
  if ("pool" in params) {
    return announcementServiceFromPool(params.pool).listCitizen({
      profileId: params.profileId,
      applicationId: params.applicationId,
      newOnly: params.newOnly,
      pagination: params.pagination,
    });
  }

  return executeListCitizenAnnouncements({
    client: params.client,
    profileId: params.profileId,
    applicationId: params.applicationId,
    newOnly: params.newOnly,
    pagination: params.pagination,
  });
}

async function executeListCitizenAnnouncements(params: {
  client: PoolClient;
  profileId: string;
  applicationId: string;
  newOnly: boolean;
  pagination: Required<PaginationParams>;
}): Promise<{ data: AnnouncementWithTranslations[]; totalCount: number }> {
  const { rows } = await params.client.query<
    Announcement & {
      totalCount: string;
      translations: Record<AnnouncementLanguage, AnnouncementTranslation>;
    }
  >(
    `
      WITH first_citizen_profile AS (
        SELECT pd.created_at as cutoff
        FROM profile_details pd
        WHERE pd.profile_id = $2 AND pd.organisation_id IS NULL
        ORDER BY pd.created_at ASC
        LIMIT 1
      ),
      paged_announcements AS (
        SELECT
          a.id,
          a.application_id as "applicationId",
          a.is_enabled as "isEnabled",
          a.publish_date as "publishDate",
          a.created_at as "createdAt",
          a.created_by as "createdBy",
          COUNT(*) OVER() as "totalCount"
        FROM announcements a
        WHERE a.application_id = $1
          AND a.is_enabled = true
          AND a.publish_date <= NOW()
          AND a.publish_date > COALESCE(
            (SELECT cutoff FROM first_citizen_profile),
            '-infinity'::timestamptz
          )
          AND (
            NOT $3::boolean
            OR NOT EXISTS (
              SELECT 1
              FROM announcement_acknowledgements aa
              WHERE aa.announcement_id = a.id AND aa.profile_id = $2
            )
          )
        ORDER BY a.publish_date DESC, a.created_at DESC
        LIMIT $4::integer OFFSET $5::integer
      )
      SELECT
        pa.id,
        pa."applicationId",
        pa."isEnabled",
        pa."publishDate",
        pa."createdAt",
        pa."createdBy",
        pa."totalCount",
        COALESCE(
          jsonb_object_agg(
            at.language,
            jsonb_build_object(
              'id', at.id,
              'announcementId', at.announcement_id,
              'language', at.language,
              'title', at.title,
              'description', at.description,
              'createdAt', at.created_at
            )
          ) FILTER (WHERE at.id IS NOT NULL),
          '{}'::jsonb
        ) as translations
      FROM paged_announcements pa
      LEFT JOIN announcement_translations at ON at.announcement_id = pa.id
      GROUP BY
        pa.id,
        pa."applicationId",
        pa."isEnabled",
        pa."publishDate",
        pa."createdAt",
        pa."createdBy",
        pa."totalCount"
      ORDER BY pa."publishDate" DESC, pa."createdAt" DESC
    `,
    [
      params.applicationId,
      params.profileId,
      params.newOnly,
      params.pagination.limit,
      params.pagination.offset,
    ],
  );

  if (rows.length === 0) {
    return {
      data: [],
      totalCount: 0,
    };
  }

  return {
    data: rows.map(
      ({ totalCount: _totalCount, ...announcement }) => announcement,
    ),
    totalCount: Number(rows[0].totalCount),
  };
}

export async function setAnnouncementEnabled(
  params: {
    id: string;
    announcement: BooleanUpdateAnnouncementEnabled;
    logger: FastifyBaseLogger;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<AnnouncementWithTranslations> {
  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeSetAnnouncementEnabled({
          client,
          id: params.id,
          announcement: params.announcement,
          logger: params.logger,
        });
      }),
    );
  }

  return executeSetAnnouncementEnabled(params);
}

async function executeSetAnnouncementEnabled(params: {
  client: PoolClient;
  id: string;
  announcement: BooleanUpdateAnnouncementEnabled;
  logger: FastifyBaseLogger;
}): Promise<AnnouncementWithTranslations> {
  const { rows: updatedRows } = await params.client.query<Announcement>(
    `
      UPDATE announcements
      SET is_enabled = $1
      WHERE id = $2
      RETURNING
        id,
        application_id as "applicationId",
        is_enabled as "isEnabled",
        publish_date as "publishDate",
        created_at as "createdAt",
        created_by as "createdBy"
    `,
    [params.announcement.isEnabled, params.id],
  );

  if (updatedRows.length === 0) {
    throw httpErrors.notFound("Announcement not found");
  }

  const announcement = updatedRows[0];
  const translations = await getAnnouncementTranslations({
    client: params.client,
    announcementId: params.id,
  });

  params.logger.debug(
    { announcementId: params.id, isEnabled: params.announcement.isEnabled },
    "Updated announcement enabled state",
  );

  return {
    ...announcement,
    translations,
  };
}

export async function acknowledgeAnnouncements(
  params: {
    profileId: string;
    applicationId: string;
    announcementIds: string[];
    logger: FastifyBaseLogger;
  } & ({ pool: Pool } | { client: PoolClient }),
): Promise<{ acknowledgedIds: string[] }> {
  if ("pool" in params) {
    return withClient(params.pool, async (client) =>
      withRollback(client, async () => {
        return executeAcknowledgeAnnouncements({
          client,
          profileId: params.profileId,
          applicationId: params.applicationId,
          announcementIds: params.announcementIds,
          logger: params.logger,
        });
      }),
    );
  }

  return executeAcknowledgeAnnouncements(params);
}

async function executeAcknowledgeAnnouncements(params: {
  client: PoolClient;
  profileId: string;
  applicationId: string;
  announcementIds: string[];
  logger: FastifyBaseLogger;
}): Promise<{ acknowledgedIds: string[] }> {
  const acknowledgedIds = [...new Set(params.announcementIds)];

  const { rows: validRows } = await params.client.query<{ id: string }>(
    `
      SELECT id
      FROM announcements
      WHERE application_id = $1 AND id = ANY($2::uuid[])
    `,
    [params.applicationId, acknowledgedIds],
  );

  if (validRows.length !== acknowledgedIds.length) {
    throw httpErrors.badRequest(
      "One or more announcement IDs are invalid for this application",
    );
  }

  await params.client.query(
    `
      INSERT INTO announcement_acknowledgements (announcement_id, profile_id)
      SELECT UNNEST($1::uuid[]), $2
      ON CONFLICT (announcement_id, profile_id) DO NOTHING
    `,
    [acknowledgedIds, params.profileId],
  );

  params.logger.debug(
    {
      profileId: `${params.profileId.substring(0, 3)}...`,
      applicationId: params.applicationId,
      acknowledgedCount: acknowledgedIds.length,
    },
    "Acknowledged announcements for profile",
  );

  return { acknowledgedIds };
}

async function getAnnouncementTranslations(params: {
  client: PoolClient;
  announcementId: string;
}): Promise<Record<AnnouncementLanguage, AnnouncementTranslation>> {
  const { rows } = await params.client.query<AnnouncementTranslation>(
    `
      ${announcementTranslationBaseQuery}
      WHERE announcement_id = $1
    `,
    [params.announcementId],
  );

  if (rows.length === 0) {
    throw httpErrors.notFound("No translations found for this announcement");
  }

  return rows.reduce<Record<AnnouncementLanguage, AnnouncementTranslation>>(
    (acc, translation) => {
      acc[translation.language] = translation;
      return acc;
    },
    {} as Record<AnnouncementLanguage, AnnouncementTranslation>,
  );
}
