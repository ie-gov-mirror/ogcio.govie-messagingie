import type fastifyPostgres from "@fastify/postgres";
import { httpErrors } from "@fastify/sensible";
import type { FastifyBaseLogger } from "fastify";
import type { PoolClient } from "pg";
import { PersonalProfileSdkWrapper } from "../../utils/personal-profile-sdk-wrapper.js";

export async function userCanAccessMultipleFilesOrThrow(params: {
  pg: fastifyPostgres.PostgresDb;
  userToCheck: string;
  userData: {
    userId: string;
    organizationId?: string | undefined;
    accessToken: string;
  };
  logger: FastifyBaseLogger;
  fileIds: string[];
}): Promise<void> {
  const { pg, userToCheck, userData, logger, fileIds } = params;
  const canAccessFile = await canUserAccessFiles({
    pg,
    fileIds,
    userData,
    userToCheck,
    logger,
  });

  if (!canAccessFile) {
    throw httpErrors.forbidden("User cannot access these files");
  }
}

async function canUserAccessFiles(params: {
  pg: fastifyPostgres.PostgresDb;
  fileIds: string[];
  userToCheck: string;
  userData: {
    userId: string;
    organizationId?: string | undefined;
    accessToken: string;
  };
  logger: FastifyBaseLogger;
}): Promise<boolean> {
  const { pg, fileIds, userData, logger, userToCheck } = params;

  const client = await pg.connect();
  try {
    let toCheckFileIds = Array.from(new Set(fileIds));

    // Check for files owned by the user
    if (userData.organizationId) {
      const ownedFiles = await getFilesOwnedByPublicServant({
        client,
        fileIds: toCheckFileIds,
        organizationId: userData.organizationId,
        userId: params.userToCheck,
      });
      if (ownedFiles.length === fileIds.length) {
        return true;
      }

      toCheckFileIds = Array.from(
        new Set(fileIds.filter((fileId) => !ownedFiles.includes(fileId))),
      );
    }

    // Get all the users the files are shared with
    const sharingMap = await getFilesSharing({
      client,
      fileIds: Array.from(toCheckFileIds),
    });

    // Check if all files are shared with the user
    const notSharedWithUser = toCheckFileIds.filter(
      (fileId) => !sharingMap[fileId]?.includes(userToCheck),
    );

    if (notSharedWithUser.length === 0) {
      return true;
    }

    // If some files are not shared with the user, check if they are shared with any of the linked profiles
    const profileSdk = new PersonalProfileSdkWrapper(logger, userData);
    const linkedProfilesIds = await profileSdk.getLinkedProfileIds(userToCheck);

    return notSharedWithUser.every((fileId) =>
      sharingMap[fileId]?.some((userId) => linkedProfilesIds.includes(userId)),
    );
  } finally {
    client.release();
  }
}

async function getFilesOwnedByPublicServant(params: {
  client: PoolClient;
  fileIds: string[];
  organizationId: string;
  userId: string;
}): Promise<string[]> {
  const { client, fileIds, organizationId, userId } = params;
  const getFilesQueryValues: (string | string[] | number)[] = [
    userId,
    fileIds,
    organizationId,
    fileIds.length,
  ];
  const filesResponse = await client.query(
    `
      SELECT id FROM files
      WHERE owner = $1 AND id = ANY($2) AND organization_id = $3 LIMIT $4
    `,
    getFilesQueryValues,
  );

  return filesResponse.rows.map((row) => row.id);
}

async function getFilesSharing(params: {
  client: PoolClient;
  fileIds: string[];
}): Promise<{ [fileId: string]: string[] }> {
  const { client, fileIds } = params;
  const getFilesSharingValues: (string[] | number)[] = [fileIds];
  const sharingResponse = await client.query(
    `
      SELECT file_id, user_id FROM files_users
      WHERE file_id = ANY($1)
    `,
    getFilesSharingValues,
  );

  const sharingMap: { [fileId: string]: string[] } = {};
  for (const row of sharingResponse.rows) {
    if (!sharingMap[row.file_id]) {
      sharingMap[row.file_id] = [];
    }
    sharingMap[row.file_id].push(row.user_id);
  }
  return sharingMap;
}
