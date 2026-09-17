import { httpErrors } from "@fastify/sensible";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ensureUserCanAccessUser } from "@ogcio/api-auth";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Permissions } from "~/const/permissions.js";
import { FindProfileSchema } from "~/schemas/profiles/find-profile.js";
import { GetProfileSchema } from "~/schemas/profiles/get.js";
import { ImportProfilesOldSchema } from "~/schemas/profiles/import-profiles.js";
import { ProfilesIndexSchema } from "~/schemas/profiles/list.js";
import type { ProfileWithDetails } from "~/schemas/profiles/model.js";
import { ProfilesPostIndexSchema } from "~/schemas/profiles/post-list.js";
import { SelectProfilesSchema } from "~/schemas/profiles/select-profiles.js";
import {
  PatchProfileSchema,
  PutProfileSchema,
} from "~/schemas/profiles/update.js";
import type {
  FastifyReplyTypebox,
  FastifyRequestTypebox,
} from "~/schemas/shared.js";
import { findProfile } from "~/services/profiles/find-profile.js";
import { getProfile } from "~/services/profiles/get-profile.js";
import { listProfiles } from "~/services/profiles/list-profiles.js";
import { selectProfiles } from "~/services/profiles/select-profiles.js";
import { areProfilesRelated } from "~/services/profiles/sql/are-profiles-related.js";
import { updateProfile } from "~/services/profiles/update-profile.js";
import { parseBooleanEnum } from "~/types/typebox.js";
import { ensureUserIdIsSet } from "~/utils/authentication-factory.js";
import { hasPermissions } from "~/utils/has-permissions.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";
import { withOrganizationId } from "~/utils/with-organization-id.js";
import { importProfilesRoute, privateDetailsRequested } from "./shared.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  const {
    pg: { pool },
    config,
  } = fastify;

  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: ProfilesIndexSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof ProfilesIndexSchema>,
      reply: FastifyReplyTypebox<typeof ProfilesIndexSchema>,
    ) => {
      const { organisationId } = await validateGetListInput(
        request,
        reply,
        fastify,
      );

      const { data, total: totalCount } = await listProfiles({
        pool,
        organisationId,
        searchParams: request.query,
        pagination: sanitizePagination(request.query),
        consentSubjects: request.query.consentSubjects
          ? request.query.consentSubjects
              .trim()
              .split(",")
              .filter((s) => s.length > 0)
          : [],
      });

      return formatAPIResponse<Partial<ProfileWithDetails>>({
        data,
        config,
        request,
        totalCount,
      });
    },
  );

  fastify.post(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserAdmin.Read]),
      schema: ProfilesPostIndexSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof ProfilesPostIndexSchema>,
      reply: FastifyReplyTypebox<typeof ProfilesPostIndexSchema>,
    ) => {
      const { organisationId } = await validatePostListInput(
        request,
        reply,
        fastify,
      );
      const { consentSubjects, ...searchParams } = request.body;
      const { data, total: totalCount } = await listProfiles({
        pool,
        organisationId,
        searchParams,
        pagination: sanitizePagination(request.query),
        consentSubjects: consentSubjects
          ? consentSubjects
              .trim()
              .split(",")
              .filter((s) => s.length > 0)
          : [],
      });

      return formatAPIResponse<Partial<ProfileWithDetails>>({
        data,
        config,
        request,
        totalCount,
      });
    },
  );

  fastify.get(
    "/select-profiles",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: SelectProfilesSchema,
    },
    async (request: FastifyRequestTypebox<typeof SelectProfilesSchema>) => {
      const profiles = await selectProfiles({
        pool,
        organizationId: withOrganizationId(request),
        profileIds: request.query.ids.split(","),
        consentSubjects: request.query.consentSubjects
          ? request.query.consentSubjects.split(",").filter((s) => s.length > 0)
          : [],
      });

      return formatAPIResponse<Partial<ProfileWithDetails>>({
        data: profiles,
        config,
        request,
        totalCount: profiles.length,
      });
    },
  );

  fastify.get(
    "/find-profile",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: FindProfileSchema,
    },
    async (request: FastifyRequestTypebox<typeof FindProfileSchema>) => {
      return {
        data: await findProfile({
          pool,
          organizationId: withOrganizationId(request),
          query: request.query,
          consentSubjects: request.query.consentSubjects
            ? request.query.consentSubjects
                .split(",")
                .filter((s) => s.length > 0)
            : [],
        }),
      };
    },
  );

  fastify.get(
    "/:profileId",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserSelf.Read,
          Permissions.UserAdmin.Read,
          Permissions.UserOnboarding.Read,
        ]),
      schema: GetProfileSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof GetProfileSchema>,
      reply: FastifyReplyTypebox<typeof GetProfileSchema>,
    ) => {
      const isSuperAdmin = await hasPermissions({
        app: fastify,
        request,
        reply,
        permissions: [Permissions.UserAdmin.Read],
      });
      const requesterId = ensureUserIdIsSet(request);
      const isCrossProfileCitizenRequest =
        requesterId !== request.params.profileId &&
        request.userData?.organizationId === undefined;
      const isRelatedOnboardingProfile =
        !isSuperAdmin &&
        isCrossProfileCitizenRequest &&
        (await hasPermissions({
          app: fastify,
          request,
          reply,
          permissions: [Permissions.UserOnboarding.Read],
        })) &&
        (await areProfilesRelated(pool, requesterId, request.params.profileId));
      const canAccessOtherProfiles = isSuperAdmin || isRelatedOnboardingProfile;
      ensureUserCanAccessGetProfile(
        request.userData,
        request.params.profileId,
        request.query.organizationId,
        canAccessOtherProfiles,
      );

      const returnPrivateDetails = await privateDetailsRequested({
        userData: {
          userId: requesterId,
          organizationId: request.userData?.organizationId,
        },
        requestProfileId: request.params.profileId,
        queryPrivateDetails: request.query.privateDetails,
        queryOrganizationId: request.query.organizationId,
        hasSuperAdminPermission: canAccessOtherProfiles,
      });

      const toGetOrganizationId =
        request.userData?.organizationId ?? request.query.organizationId;

      // we return linked profiles only when
      // requesting "generic" data for yourself or
      // as a super admin/onboarding
      const addLinkedProfiles =
        (request.params.profileId === request.userData?.userId ||
          canAccessOtherProfiles) &&
        returnPrivateDetails;

      const consentSubjects = request.query.consentSubjects
        ? request.query.consentSubjects
            .trim()
            .split(",")
            .filter((s) => s.length > 0)
        : [];

      return {
        data: await getProfile({
          pool,
          organizationId: returnPrivateDetails
            ? undefined
            : toGetOrganizationId,
          profileId: request.params.profileId,
          addLinkedProfiles,
          consentSubjects,
        }),
      };
    },
  );

  fastify.put(
    "/:profileId",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Write]),
      schema: PutProfileSchema,
    },
    async ({
      body: data,
      params: { profileId },
      query: { organizationId },
      userData,
      log,
    }: FastifyRequestTypebox<typeof PutProfileSchema>) => {
      ensureUserCanAccessUser(userData, profileId);

      return {
        data: await updateProfile({
          pool,
          toUpdateProfileId: profileId,
          updateRequestedById: userData?.userId as string,
          organizationId,
          toSetProfileData: data,
          getLogtoClient: fastify.getLogtoClient,
          logger: log,
        }),
      };
    },
  );

  fastify.patch(
    "/:profileId",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserSelf.Write]),
      schema: PatchProfileSchema,
    },
    async ({
      body: data,
      params: { profileId },
      query: { organizationId },
      userData,
      log,
    }: FastifyRequestTypebox<typeof PatchProfileSchema>) => {
      return {
        data: await updateProfile({
          pool,
          updateRequestedById: userData?.userId as string,
          toUpdateProfileId: profileId,
          organizationId,
          toSetProfileData: data,
          getLogtoClient: fastify.getLogtoClient,
          logger: log,
        }),
      };
    },
  );

  // TODO: Remove this old route once all clients have migrated to the new route through SDK
  fastify.post(
    "/import-profiles",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Write,
          Permissions.UserAdmin.Write,
        ]),
      schema: ImportProfilesOldSchema,
    },
    async (
      request: FastifyRequestTypebox<typeof ImportProfilesOldSchema>,
      reply: FastifyReplyTypebox<typeof ImportProfilesOldSchema>,
    ) => {
      return importProfilesRoute(request, reply, fastify);
    },
  );

  function ensureUserCanAccessGetProfile(
    userData: FastifyRequest["userData"],
    queryProfileId: string,
    queryOrganizationId: string | undefined,
    isSuperAdmin: boolean,
  ): void {
    const isSameUser = userData?.userId === queryProfileId;
    const isPublicServant = userData?.organizationId !== undefined;
    if (!isSameUser && !isPublicServant && !isSuperAdmin) {
      throw httpErrors.forbidden("You can't access this user's data");
    }
    // at this point we are already sure that the user requested
    // for a profileId that can be accessed
    // let's focus on organization check when needed

    // if queryOrganizationId is not provided it means that
    // it is trying to access its own data
    // or the data of the logged-in organization
    // if the user is not a ps, it can access any data for himself
    if (!queryOrganizationId || !userData?.organizationId) {
      return;
    }

    // a ps can access data only for its own organization
    if (userData.organizationId !== queryOrganizationId) {
      throw httpErrors.forbidden(
        "You can't access this user's data for this organization",
      );
    }
  }

  async function validatePostListInput(
    request: FastifyRequestTypebox<typeof ProfilesPostIndexSchema>,
    reply: FastifyReplyTypebox<typeof ProfilesPostIndexSchema>,
    app: FastifyInstance,
  ): Promise<{ organisationId: string | undefined }> {
    const isSuperAdmin = await hasPermissions({
      app,
      request,
      reply,
      permissions: [Permissions.UserAdmin.Read],
    });

    if (
      request.userData?.organizationId &&
      request.body.organizationId &&
      request.body.organizationId !== request.userData?.organizationId
    ) {
      throw httpErrors.unauthorized("Cannot access data for this organization");
    }

    // Super admin must request token for resource, not for organization
    const organisationId = isSuperAdmin
      ? request.body.organizationId
      : withOrganizationId(request);

    return { organisationId };
  }

  async function validateGetListInput(
    request: FastifyRequestTypebox<typeof ProfilesIndexSchema>,
    reply: FastifyReplyTypebox<typeof ProfilesIndexSchema>,
    app: FastifyInstance,
  ): Promise<{ organisationId: string | undefined }> {
    const privateDetails = parseBooleanEnum(
      request.query.privateDetails ?? "false",
    );
    const organisationId = withOrganizationId(request);
    if (!privateDetails) {
      return { organisationId };
    }

    const isSuperAdmin = await hasPermissions({
      app,
      request,
      reply,
      permissions: [Permissions.UserAdmin.Read],
    });

    if (!isSuperAdmin) {
      throw httpErrors.unauthorized("Cannot access private details for users");
    }

    return { organisationId: undefined };
  }
};

export default plugin;
export const autoPrefix = "/api/v1/profiles";
