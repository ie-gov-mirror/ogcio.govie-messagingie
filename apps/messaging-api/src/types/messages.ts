import { type Static, Type } from "typebox";
import { HttpError } from "./httpErrors.js";
import { MessageEventSchema } from "./message-events.js";
import { AllProviderTypesSchema } from "./providers.js";
import {
  getGenericResponseSchema,
  PaginationParamsSchema,
  TypeboxBooleanEnum,
  TypeboxStringEnum,
} from "./schemaDefinitions.js";
import {
  type SecurityLevels,
  SecurityLevelsSchema,
} from "./security-levels.js";

const MESSAGES_TAGS = ["Messages"];

/** Common */

const IdSchema = Type.Object({
  id: Type.String({ format: "uuid", description: "Unique Id of the resource" }),
});

const GenericIdResponseSchema = getGenericResponseSchema(IdSchema);
export type GenericIdResponse = Static<typeof GenericIdResponseSchema>;

export const MessageInputSchema = Type.Object({
  threadName: Type.Optional(
    Type.String({
      description: "Thread Name used to group messages",
      minLength: 1,
    }),
  ),
  subject: Type.String({
    description:
      "Subject. This is the only part that will be seen outside of the messaging platform is security is 'confidential'",
    minLength: 1,
  }),
  excerpt: Type.Optional(
    Type.String({
      description: "Brief description of the message",
    }),
  ),
  plainText: Type.String({
    description: "Plain text version of the message",
    minLength: 1,
  }),
  richText: Type.Optional(
    Type.String({
      description: "Rich text (html) version of the message",
    }),
  ),
  language: TypeboxStringEnum(
    ["en", "ga"],
    undefined,
    "Language used to send the message",
  ),
  externalId: Type.Optional(
    Type.String({
      description: "External id to link the message to an external system",
    }),
  ),
});
export type MessageInput = Static<typeof MessageInputSchema>;

export const CreateMessageOptionsSchema = Type.Object({
  preferredTransports: Type.Array(AllProviderTypesSchema),
  userIds: Type.Array(Type.String()),
  security: SecurityLevelsSchema,
  scheduleAt: Type.String({ format: "date-time" }),
});
export type CreateMessageOptions = Static<typeof CreateMessageOptionsSchema>;

/** Create message */

// Caps the id's length; the set of ids stays open, as the journey owns them
const MESSAGE_TEMPLATE_ID_MAX_LENGTH = 128;

// Journey submission ids are always 8 characters
const SUBMISSION_ID_LENGTH = 8;

// The step becomes a metric label: the cap bounds its values, 0 to 100
const JOURNEY_STEP_MAX = 100;

// The journey part of the public API's Message metadata, same shape
const MessageMetadataSchema = Type.Object(
  {
    journey: Type.Optional(
      Type.Object({
        journeyId: Type.Optional(
          Type.String({
            format: "uuid",
            description:
              "Identifier of the journey that triggered this message",
          }),
        ),
        submissionId: Type.String({
          minLength: SUBMISSION_ID_LENGTH,
          maxLength: SUBMISSION_ID_LENGTH,
          description: "Identifier of the journey submission of this message",
        }),
        journeyStep: Type.Optional(
          Type.Integer({
            minimum: 0,
            maximum: JOURNEY_STEP_MAX,
            description: "Position, counted from 0, of the journey step",
          }),
        ),
        messageTemplateId: Type.Optional(
          Type.String({
            minLength: 1,
            maxLength: MESSAGE_TEMPLATE_ID_MAX_LENGTH,
            description:
              "Id of the journey's template the message was produced from (not a MessagingIE template)",
          }),
        ),
      }),
    ),
  },
  { minProperties: 1 },
);

export type MessageMetadata = Static<typeof MessageMetadataSchema>;

// Message metadata as MessagingIE keeps it: the journey also carries the
// citizen's geohash, read from the create request's baggage
export type StoredMessageMetadata = {
  journey?: NonNullable<MessageMetadata["journey"]> & { geohash?: string };
};

export const CreateMessageBodySchema = Type.Object({
  preferredTransports: Type.Array(AllProviderTypesSchema, {
    description:
      "The list of the preferred transports to use. If the selected transports are not available for the recipient, others will be used",
  }),
  recipientUserId: Type.String({
    description: "Unique user id of the recipient",
  }),
  security: SecurityLevelsSchema,
  scheduleAt: Type.String({
    format: "date-time",
    description: "Date and time of when schedule the message",
  }),
  message: MessageInputSchema,
  attachments: Type.Optional(
    Type.Array(Type.String({ format: "uuid" }), {
      maxItems: 3,
      uniqueItems: true,
      description: "Ids of the related attachments (maximum 3)",
    }),
  ),
  bypassConsent: Type.Optional(
    Type.Boolean({
      default: false,
      description:
        "Set to true to bypass recipient messaging consent checks. Requires platform:messaging:write; omitted or false preserves normal consent enforcement.",
    }),
  ),
  metadata: Type.Optional(MessageMetadataSchema),
});

export type CreateMessageBody = Static<typeof CreateMessageBodySchema>;

export const CreateMessageReqSchema = {
  description: "Creates a message",
  tags: MESSAGES_TAGS,
  body: CreateMessageBodySchema,
  operationId: "CreateMessage",
  response: {
    "4xx": HttpError,
    "5xx": HttpError,
    201: GenericIdResponseSchema,
  },
};

export type SenderUser = {
  id: string;
  organizationId: string;
  isM2MApplication: boolean;
};

/** Get message */

export const ReadMessageSchema = Type.Object({
  subject: Type.String({
    description:
      "Subject. This is the only part that will be seen outside of the messaging platform is security is 'confidential'",
  }),
  createdAt: Type.String({ description: "Creation date time" }),
  threadName: Type.Union([
    Type.String({
      description: "Thread Name used to group messages",
    }),
    Type.Null(),
  ]),
  organisationId: Type.String({ description: "Organisation sender id" }),
  recipientUserId: Type.String({ description: "Unique id of the recipient" }),
  excerpt: Type.Union([
    Type.String({ description: "Brief description of the message" }),
    Type.Null(),
  ]),
  plainText: Type.String({ description: "Plain text version of the message" }),
  richText: Type.Union([
    Type.String({ description: "Rich text version of the message" }),
    Type.Null(),
  ]),
  isSeen: Type.Boolean({
    description: "True if the message has already been seen by the recipient",
  }),
  security: SecurityLevelsSchema,
  attachments: Type.Array(Type.String({ format: "uuid" }), {
    maxItems: 3,
    description: "Ids of the related attachments (maximum 3)",
  }),
  externalId: Type.Union([
    Type.String({
      description: "External id to link the message to an external system",
    }),
    Type.Null(),
  ]),
});
export type ReadMessage = Static<typeof ReadMessageSchema>;

export const PartialReadMessageSchema = Type.Pick(ReadMessageSchema, [
  "recipientUserId",
  "organisationId",
]);
export type PartialReadMessage = Static<typeof PartialReadMessageSchema>;

const GetMessageResponseSchema = getGenericResponseSchema(ReadMessageSchema);
export type GetMessageResponse = Static<typeof GetMessageResponseSchema>;
const GetPartialMessageResponseSchema = getGenericResponseSchema(
  PartialReadMessageSchema,
);
export type GetPartialMessageResponse = Static<
  typeof GetPartialMessageResponseSchema
>;

const GetMessageQuerystringSchema = Type.Object({
  deleted: Type.Optional(TypeboxBooleanEnum()),
});

export const GetMessageReqSchema = {
  description: "Returns the requested message",
  tags: MESSAGES_TAGS,
  operationId: "GetMessage",
  params: Type.Object({
    messageId: Type.String({
      format: "uuid",
      description: "The requested message unique id",
    }),
  }),
  querystring: GetMessageQuerystringSchema,
  response: {
    200: Type.Union([
      GetMessageResponseSchema,
      GetPartialMessageResponseSchema,
    ]),
    "4xx": HttpError,
    "5xx": HttpError,
  },
};

export type GetMessageParams = Static<typeof GetMessageReqSchema.params>;
export type GetMessageQuerystring = Static<typeof GetMessageQuerystringSchema>;

/** List messages */

export const MessageListItemSchema = Type.Object({
  id: Type.String({ description: "Unique Id of the message" }),
  subject: Type.String({ description: "Subject" }),
  createdAt: Type.String({ description: "Creation date time" }),
  threadName: Type.Union([
    Type.String({
      description: "Thread Name used to group messages",
    }),
    Type.Null(),
  ]),
  organisationId: Type.String({ description: "Organisation sender id" }),
  recipientUserId: Type.String({ description: "Unique id of the recipient" }),
  attachmentsCount: Type.Integer({ description: "Number of attachments" }),
  isSeen: Type.Boolean({
    description: "True if the message has already been seen by the recipient",
  }),
});
export const MessageListSchema = Type.Array(MessageListItemSchema);
export type MessageList = Static<typeof MessageListSchema>;

const ListMessageResponseSchema = getGenericResponseSchema(MessageListSchema);
export type ListMessageResponse = Static<typeof ListMessageResponseSchema>;

const IdParamsSchema = Type.Object({
  recipientUserId: Type.Optional(
    Type.String({
      description: "Either recipientUserId and organisationId are mandatory",
    }),
  ),
  organisationId: Type.Optional(
    Type.String({
      description: "Either recipientUserId and organisationId are mandatory",
    }),
  ),
});

const DeliveredSchema = Type.Literal("delivered");
export type Delivered = Static<typeof DeliveredSchema>;

export const SearchParamsSchema = Type.Object({
  status: Type.Optional(DeliveredSchema),
  isSeen: Type.Optional(TypeboxBooleanEnum()),
  search: Type.Optional(Type.String()),
  deletedAfterDateTime: Type.Optional(Type.String({ format: "date-time" })),
  tagId: Type.Optional(
    Type.String({
      format: "uuid",
      description: "Filter messages by tag id",
    }),
  ),
  untagged: Type.Optional(
    TypeboxBooleanEnum(
      undefined,
      "If true, return only messages without a tag",
    ),
  ),
});

const ListMessagesParamsSchema = Type.Optional(
  Type.Evaluate(
    Type.Intersect([
      SearchParamsSchema,
      IdParamsSchema,
      PaginationParamsSchema,
    ]),
  ),
);

export type ListMessagesReqParams = Static<typeof ListMessagesParamsSchema>;

export const ListMessagesReqGetSchema = {
  description:
    "Returns all the messages for the requested organisation or the requested recipient",
  tags: MESSAGES_TAGS,
  operationId: "ListMessages",
  querystring: ListMessagesParamsSchema,
  response: {
    200: ListMessageResponseSchema,
    "4xx": HttpError,
    "5xx": HttpError,
  },
};

export const ListMessagesReqPostSchema = {
  description:
    "Returns all the messages for the requested organisation or the requested recipient",
  tags: MESSAGES_TAGS,
  operationId: "ListMessagesPost",
  body: ListMessagesParamsSchema,
  response: {
    200: ListMessageResponseSchema,
    "4xx": HttpError,
    "5xx": HttpError,
  },
};

export type MessageToDeliverWoAttachments = {
  id: string;
  transports?: string[];
  subject: string;
  excerpt?: string;
  body: string;
  securityLevel: SecurityLevels;
  richText?: string;
  externalId?: string;
  createdAt?: string;
  messageMetadata?: StoredMessageMetadata;
};

export type MessageToDeliver = MessageToDeliverWoAttachments & {
  attachmentIds: string[] | undefined;
};

export const GetEventsForMessageReqSchema = {
  description: "Returns the list of events for the given message id",
  tags: MESSAGES_TAGS,
  response: {
    200: Type.Object({
      data: MessageEventSchema,
    }),
    "5xx": HttpError,
    "4xx": HttpError,
  },
  params: Type.Object({
    messageId: Type.String({ format: "uuid" }),
  }),
};

const DeleteMessagesIdsSchema = Type.Object({
  ids: Type.Array(Type.String({ format: "uuid" }), {
    description: "List of message ids to delete",
    minItems: 1,
    maxItems: 100,
  }),
});

export type DeleteMessagesIds = Static<typeof DeleteMessagesIdsSchema>;

export const DeleteMessagesReqSchema = {
  description: "Deletes the message with the given message id",
  tags: MESSAGES_TAGS,
  response: {
    200: Type.Object({
      data: DeleteMessagesIdsSchema,
    }),
    "5xx": HttpError,
    "4xx": HttpError,
  },
  body: DeleteMessagesIdsSchema,
};

export const RestoreMessagesReqSchema = {
  description:
    "Moves the deleted messages with the given ids back to the inbox",
  tags: MESSAGES_TAGS,
  response: DeleteMessagesReqSchema.response,
  body: DeleteMessagesIdsSchema,
};

export const EraseMessagesReqSchema = {
  description:
    "Erases the deleted messages with the given ids from the recipient's account, attachments included. The sender's record is kept",
  tags: MESSAGES_TAGS,
  response: DeleteMessagesReqSchema.response,
  body: DeleteMessagesIdsSchema,
};
