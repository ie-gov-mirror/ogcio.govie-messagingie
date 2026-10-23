import { Type } from "typebox";
import { getGenericResponseSchema } from "~/types/generic-response.js";
import { HttpError } from "~/types/http-error.js";
import { TypeboxBooleanEnum } from "~/types/typebox.js";
import { PROFILES_TAG } from "./constants.js";
import { ProfileWithDetailsListSchema } from "./model.js";

export const SelectProfilesSchema = {
  tags: [PROFILES_TAG],
  operationId: "selectProfiles",
  querystring: Type.Object({
    ids: Type.String({
      description: "Comma-separated list of profile IDs",
      pattern: "^[a-zA-Z0-9-]+(,[a-zA-Z0-9-]+)*$",
    }),
    consentSubjects: Type.Optional(
      Type.String({
        description:
          "Write subjects split by comma, if set will return consent statuses for those subjects, otherwise consent statuses will be null",
      }),
    ),
    includeFullDetails: Type.Optional(
      TypeboxBooleanEnum(
        "true",
        "When omitted or true, return the full profile. When false, return only the profile id.",
      ),
    ),
  }),
  response: {
    200: getGenericResponseSchema(
      Type.Union([
        ProfileWithDetailsListSchema,
        Type.Array(Type.Object({ id: Type.String() })),
      ]),
    ),
    "4xx": HttpError,
    "5xx": HttpError,
  },
};
