import { type Static, Type } from "typebox";
import { HttpError } from "./httpErrors.js";
import {
  type GenericResponse,
  getGenericResponseSchema,
  PaginationParamsSchema,
  TypeboxBooleanEnum,
  TypeboxStringEnum,
} from "./schemaDefinitions.js";

/** Common */

const tags = ["Providers"];

export const ProviderTypes = {
  Email: "email",
  LifeEvents: "lifeEvent",
};

const EditableProviderTypesSchema = TypeboxStringEnum(
  [ProviderTypes.Email],
  undefined,
  "Provider types that can be manipulated",
);
export type EditableProviderTypes = Static<typeof EditableProviderTypesSchema>;

export const AllProviderTypesSchema = TypeboxStringEnum(
  Object.values(ProviderTypes),
  undefined,
  "All the available provider types",
);

const ProviderIdSchema = Type.Object({
  providerId: Type.String({ format: "uuid" }),
});

/** Provider Create */

const EmailCreateBodySchema = Type.Object({
  providerName: Type.String({
    description: "Name of the provider",
    minLength: 1,
  }),
  isPrimary: Type.Boolean({
    description:
      "If true, the provider is set as primary for the selected type for the current organisation. Please note, each organisation can only have one primary provider for each type",
  }),
  type: TypeboxStringEnum([ProviderTypes.Email]),
  smtpHost: Type.String({
    description: "Address of the SMTP host",
    minLength: 1,
  }),
  smtpPort: Type.Number({
    description: "Port of the SMTP host",
  }),
  username: Type.String({
    description: "Username to use to log into the SMTP server",
    minLength: 1,
  }),
  password: Type.String({
    description: "Password to use to log into the SMTP server",
    minLength: 1,
  }),
  throttle: Type.Optional(
    Type.Number({
      description:
        "Optional field to adjust how long time between each mail, in miliseconds",
    }),
  ),
  fromAddress: Type.String({
    description: "Email address to use as sender",
    minLength: 1,
  }),
  ssl: Type.Boolean({
    description: "Is connection to the SMTP server secure?",
  }),
  headers: Type.Optional(
    Type.Union([
      Type.Null(),
      Type.Record(
        Type.String(),
        Type.Union([Type.String(), Type.Array(Type.String())]),
        {
          description:
            "Optional field to add custom headers to all emails sent with this provider",
        },
      ),
    ]),
  ),
});
export type EmailCreateBody = Static<typeof EmailCreateBodySchema>;

const ProviderCreateBodySchema = Type.Union([EmailCreateBodySchema]);

const ProviderCreateResponseSchema = getGenericResponseSchema(
  Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
);

export const ProviderCreateReqSchema = {
  description: "Creates a new provider",
  tags,
  operationId: "CreateProvider",
  body: ProviderCreateBodySchema,
  response: {
    201: ProviderCreateResponseSchema,
    "5xx": HttpError,
    "4xx": HttpError,
  },
};

/** Provider update */
const EmailProviderSchema = Type.Evaluate(
  Type.Intersect([
    Type.Object({ id: Type.String({ format: "uuid" }) }),
    EmailCreateBodySchema,
  ]),
);

export type EmailProvider = Static<typeof EmailProviderSchema>;

// A provider's acceptance of an email; SES's carries the email's message ID
export type ProviderAcceptance = { providerMessageId?: string };

const NoPasswordEmailProviderSchema = Type.Omit(EmailProviderSchema, [
  "password",
]);
export type NoPasswordEmailProvider = Static<
  typeof NoPasswordEmailProviderSchema
>;

const ProviderUpdateResponseSchema = getGenericResponseSchema(
  Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
);

const ProviderUpdateBodySchema = Type.Evaluate(
  Type.Intersect([
    Type.Omit(EmailProviderSchema, ["password"]),
    Type.Object({
      password: Type.Optional(
        Type.Union([
          Type.String({
            description: "Password to use to log into the SMTP server",
            minLength: 0,
          }),
          Type.Null(),
        ]),
      ),
    }),
  ]),
);

export type ProviderUpdateBody = Static<typeof ProviderUpdateBodySchema>;

export const ProviderUpdateReqSchema = {
  description: "Updates the requested provider",
  tags,
  params: ProviderIdSchema,
  operationId: "UpdateProvider",
  body: ProviderUpdateBodySchema,
  response: {
    200: ProviderUpdateResponseSchema,
    "5xx": HttpError,
    "4xx": HttpError,
  },
};

/** Providers List */

const ProvidersListItemSchema = Type.Object({
  id: Type.String({ format: "uuid", description: "Unique id of the provider" }),
  providerName: Type.String({ description: "Name of the provider" }),
  isPrimary: Type.Boolean({
    description:
      "If true, the provider is set as primary for the selected type for the current organisation. Please note, each organisation can only have one primary provider for each type",
  }),
  type: EditableProviderTypesSchema,
});
export type ProvidersListItem = Static<typeof ProvidersListItemSchema>;

const ProvidersListSchema = Type.Array(ProvidersListItemSchema);
export type ProvidersList = Static<typeof ProvidersListSchema>;

export const ProvidersListReqSchema = {
  description: "Returns the providers matching the requested query",
  tags,
  operationId: "ListProviders",
  querystring: Type.Evaluate(
    Type.Intersect([
      Type.Object({
        primary: Type.Optional(
          TypeboxBooleanEnum(
            undefined,
            "If set, returns only the primary providers if true, otherwise the non-primary ones",
          ),
        ),
        type: EditableProviderTypesSchema,
      }),
      PaginationParamsSchema,
    ]),
  ),
  response: {
    200: getGenericResponseSchema(ProvidersListSchema),
    "5xx": HttpError,
    "4xx": HttpError,
  },
};

export type ProvidersListResponse = GenericResponse<ProvidersList>;

/** ProviderGet */

export const ProviderGetReqSchema = {
  description: "Returns the requested provider",
  tags,
  params: ProviderIdSchema,
  querystring: Type.Object({
    type: EditableProviderTypesSchema,
  }),
  response: {
    200: getGenericResponseSchema(NoPasswordEmailProviderSchema),
    "5xx": HttpError,
    "4xx": HttpError,
  },
};

/** Provider Delete */

const ProviderDeleteResponseSchema = getGenericResponseSchema(
  Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
);

export const ProviderDeleteReqSchema = {
  description: "Deletes the requested provider",
  tags,
  operationId: "DeleteProvider",
  params: ProviderIdSchema,
  querystring: Type.Object({ type: EditableProviderTypesSchema }),
  response: {
    200: ProviderDeleteResponseSchema,
    "5xx": HttpError,
    "4xx": HttpError,
  },
};
