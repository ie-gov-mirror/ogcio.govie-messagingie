import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Permissions } from "~/const/permissions.js";
import {
  OrganisationCreateConsentStatementSchema,
  OrganisationCurrentConsentStatementSchema,
  OrganisationDisableConsentStatementSchema,
  OrganisationGetConsentStatementSchema,
  OrganisationListConsentStatementsSchema,
  OrganisationUpdateConsentStatementSchema,
} from "~/schemas/consent-statements/organisation.js";
import type { FastifyRequestTypebox } from "~/schemas/shared.js";
import { ConsentStatementService } from "~/services/consent-statements/consent-statement-service.js";
import {
  createConsentStatement,
  disableConsentStatement,
  updateConsentStatement,
} from "~/services/consent-statements/consent-statements-service.js";
import { parseBooleanEnum } from "~/types/typebox.js";
import { ensureUserIdIsSet } from "~/utils/authentication-factory.js";
import { formatAPIResponse, sanitizePagination } from "~/utils/pagination.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify: FastifyInstance) => {
  fastify.get(
    "/current",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [
          Permissions.User.Read,
          Permissions.UserAdmin.Read,
        ]),
      schema: OrganisationCurrentConsentStatementSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationCurrentConsentStatementSchema
      >,
    ) => {
      const inputSubjects =
        request.query.subject.trim().length > 0
          ? request.query.subject.trim().split(",")
          : [];

      const output = await new ConsentStatementService(
        fastify.db,
      ).getCurrentMany(inputSubjects);

      return { data: output };
    },
  );

  fastify.post(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserAdmin.Write]),
      schema: OrganisationCreateConsentStatementSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationCreateConsentStatementSchema
      >,
    ) => {
      const { id } = await createConsentStatement({
        pool: fastify.pg.pool,
        consentStatement: {
          ...request.body,
          isEnabled: parseBooleanEnum(request.body.isEnabled),
        },
        logger: request.log,
        loggedInUserId:
          request.userData?.isM2MApplication === true
            ? null
            : ensureUserIdIsSet(request),
      });

      return { data: { id } };
    },
  );

  fastify.get(
    "/",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserAdmin.Read]),
      schema: OrganisationListConsentStatementsSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationListConsentStatementsSchema
      >,
    ) => {
      const output = await new ConsentStatementService(fastify.db).list({
        subject: request.query.subject,
        isEnabled:
          request.query.isEnabled !== undefined
            ? parseBooleanEnum(request.query.isEnabled)
            : undefined,
        pagination: sanitizePagination({ ...request.query }),
      });

      return formatAPIResponse({
        data: output.data,
        totalCount: output.totalCount,
        config: fastify.config,
        request,
      });
    },
  );

  fastify.get(
    "/:id",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.User.Read]),
      schema: OrganisationGetConsentStatementSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationGetConsentStatementSchema
      >,
    ) => {
      return {
        data: await new ConsentStatementService(fastify.db).getById(
          request.params.id,
        ),
      };
    },
  );

  fastify.put(
    "/:id",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserAdmin.Write]),
      schema: OrganisationUpdateConsentStatementSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationUpdateConsentStatementSchema
      >,
    ) => {
      await updateConsentStatement({
        pool: fastify.pg.pool,
        consentStatement: {
          ...request.body,
          isEnabled: parseBooleanEnum(request.body.isEnabled),
        },
        logger: request.log,
        id: request.params.id,
      });

      return { data: { id: request.params.id } };
    },
  );

  fastify.patch(
    "/:id/disable",
    {
      preValidation: (req, res) =>
        fastify.checkPermissions(req, res, [Permissions.UserAdmin.Write]),
      schema: OrganisationDisableConsentStatementSchema,
    },
    async (
      request: FastifyRequestTypebox<
        typeof OrganisationDisableConsentStatementSchema
      >,
    ) => {
      const disabledStatement = await disableConsentStatement({
        pool: fastify.pg.pool,
        id: request.params.id,
        logger: request.log,
      });

      return { data: disabledStatement };
    },
  );
};

export default plugin;
export const autoPrefix = "/api/v1/organisations/consent-statements";
