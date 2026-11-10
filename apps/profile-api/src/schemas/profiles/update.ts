import { type Static, Type } from "typebox";
import { getGenericResponseSchema } from "~/types/generic-response.js";
import { HttpError } from "~/types/http-error.js";
import { PROFILES_TAG } from "./constants.js";
import { LanguagesWithNoDefault, ProfileWithDetailsSchema } from "./model.js";

const PatchProfileBodySchema = Type.Object(
  {
    publicName: Type.Optional(Type.String()),
    email: Type.Optional(Type.String({ format: "email" })),
    phone: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    firstName: Type.Optional(Type.String()),
    lastName: Type.Optional(Type.String()),
    dateOfBirth: Type.Optional(Type.String({ format: "date" })),
    preferredLanguage: Type.Optional(LanguagesWithNoDefault),
    primaryUserId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type PatchProfileBody = Static<typeof PatchProfileBodySchema>;

const PutProfileBodySchema = Type.Object(
  {
    publicName: Type.String(),
    email: Type.Optional(Type.String({ format: "email" })),
    phone: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    firstName: Type.Optional(Type.String()),
    lastName: Type.Optional(Type.String()),
    dateOfBirth: Type.Optional(Type.String({ format: "date" })),
    preferredLanguage: LanguagesWithNoDefault,
  },
  { additionalProperties: false },
);
export type PutProfileBody = Static<typeof PutProfileBodySchema>;

export const PutProfileSchema = {
  tags: [PROFILES_TAG],
  operationId: "putProfile",
  params: Type.Object({
    profileId: Type.String({
      description: "ID of the profile to update",
    }),
  }),
  querystring: Type.Object({
    organizationId: Type.Optional(
      Type.String({
        description: "Organization ID owning the profile",
      }),
    ),
  }),
  body: PutProfileBodySchema,
  response: {
    200: getGenericResponseSchema(ProfileWithDetailsSchema),
    "4xx": HttpError,
    "5xx": HttpError,
  },
};

export const PatchProfileSchema = {
  ...PutProfileSchema,
  querystring: Type.Object({
    ...PutProfileSchema.querystring.properties,
    messageId: Type.Optional(
      Type.String({
        description:
          "ID of a message sent to the profile, required to link another profile",
      }),
    ),
  }),
  body: PatchProfileBodySchema,
  operationId: "patchProfile",
};
