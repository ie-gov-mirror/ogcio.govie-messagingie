import { httpErrors } from "@fastify/sensible";
import type { FastifyBaseLogger } from "fastify";
import { getM2MProfileSdk } from "../../../utils/authentication-factory.js";

// 100 ids keeps the query string small; switch to a body lookup if Profile grows one.
const PROFILE_ID_CHUNK = 100;

const statusCodeOf = (error: unknown): number | undefined => {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = error.statusCode;
    return typeof statusCode === "number" ? statusCode : undefined;
  }
  return undefined;
};

export const ensureShareTargetProfilesExist = async (params: {
  organizationId: string | undefined;
  userIds: string[];
  logger: FastifyBaseLogger;
}): Promise<void> => {
  const ids = [...new Set(params.userIds)];
  if (!params.organizationId) {
    throw httpErrors.serviceUnavailable("Profile service is unavailable");
  }

  const profile = await getM2MProfileSdk(params.logger, params.organizationId);
  const found = new Set<string>();

  for (let offset = 0; offset < ids.length; offset += PROFILE_ID_CHUNK) {
    const chunk = ids.slice(offset, offset + PROFILE_ID_CHUNK);
    let result: Awaited<ReturnType<typeof profile.selectProfiles>>;
    try {
      result = await profile.selectProfiles(chunk.join(","), undefined, false);
    } catch {
      throw httpErrors.serviceUnavailable("Profile service is unavailable");
    }

    if (result.error) {
      if (statusCodeOf(result.error) === 404) {
        throw httpErrors.notFound("Profile not found");
      }
      throw httpErrors.serviceUnavailable("Profile service is unavailable");
    }

    for (const row of result.data ?? []) {
      found.add(row.id);
    }
  }

  if (ids.some((id) => !found.has(id))) {
    throw httpErrors.notFound("Profile not found");
  }
};
