import type fastifyPostgres from "@fastify/postgres";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import { fileServiceFromPool } from "../../services/file-service.js";
import { sharingServiceFromPool } from "../../services/sharing-service.js";
import { PersonalProfileSdkWrapper } from "../../utils/personal-profile-sdk-wrapper.js";

export default async (
  app: FastifyInstance,
  request: FastifyRequest,
  fileId: string,
): Promise<void> => {
  const canAccessFile = request.userData
    ? await canUserAccessFile(
        app.pg,
        fileId,
        {
          ...request.userData,
          organizationId: request.userData.organizationId,
        },
        request.log,
      )
    : false;

  if (!canAccessFile) {
    throw app.httpErrors.forbidden("User cannot access this file");
  }
};

async function canUserAccessFile(
  pg: fastifyPostgres.PostgresDb,
  fileId: string,
  userData: {
    userId: string;
    organizationId: string | undefined;
    accessToken: string;
  },
  logger: FastifyBaseLogger,
): Promise<boolean> {
  const fileService = fileServiceFromPool(pg.pool);
  const sharingService = sharingServiceFromPool(pg.pool);

  // If it is a public servant check if the file
  // is owned by the org
  if (userData.organizationId) {
    const ownedByOrg = await fileService.isFileOwnedByOrganization(
      userData.organizationId,
      fileId,
    );
    if (ownedByOrg) {
      return true;
    }
  }
  // Otherwise check if the file has been shared with the user
  if (await sharingService.isSharedWithUser(fileId, userData.userId)) {
    return true;
  }

  const profileSdk = new PersonalProfileSdkWrapper(logger, userData);
  const linkedProfilesIds = await profileSdk.getLinkedProfileIds(
    userData.userId,
  );

  // Otherwise check if the file has been shared with any linked profile
  if (await sharingService.isSharedWithAnyUser(fileId, linkedProfilesIds)) {
    return true;
  }

  return false;
}
