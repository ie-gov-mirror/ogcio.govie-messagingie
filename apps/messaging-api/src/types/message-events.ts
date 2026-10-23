import { type Static, Type } from "typebox";
import { HttpError } from "./httpErrors.js";
import {
  getGenericResponseSchema,
  PaginationParamsSchema,
  TypeboxStringEnum,
} from "./schemaDefinitions.js";
import { SecurityLevelsSchema } from "./security-levels.js";

const tags = ["Message events"];

export const MessageEventListSchema = Type.Array(
  Type.Object({
    id: Type.String({
      format: "uuid",
      description: "Unique id of the event",
    }),
    messageId: Type.String({
      format: "uuid",
      description: "Unique id of the related message",
    }),
    subject: Type.String({ description: "Subject of the related message" }),
    receiverFullName: Type.String({
      description: "Full name of the recipient",
    }),
    eventType: Type.String({ description: "Event type description" }),
    eventStatus: Type.String({ description: "Status for event type" }),
    scheduledAt: Type.String({
      description:
        "Date and time which describes when the message has to be sent",
    }),
  }),
);

export type MessageEventList = Static<typeof MessageEventListSchema>;

const SingleMessageEventSchema = Type.Object({
  messageId: Type.String({ format: "uuid", description: "Message id" }),
  eventType: Type.String({ description: "Event type description" }),
  eventStatus: Type.String({ description: "Status for event type" }),
  data: Type.Union([
    // Create data
    Type.Object({
      messageId: Type.String({
        description: "Unique id of the related message",
      }),
      receiverFullName: Type.String({
        description: "Full name of the recipient",
      }),
      receiverPPSN: Type.String({
        description: "PPSN of the recipient",
      }),
      receiverUserId: Type.String({ description: "User id of recipient" }),
      subject: Type.String({ description: "Subject of the related message" }),
      language: Type.String({
        description: "Language of the related message",
      }),
      excerpt: Type.Optional(
        Type.String({ description: "Excerpt of the related message" }),
      ),
      richText: Type.Optional(
        Type.String({
          description: "Rich text content of the related message",
        }),
      ),
      plainText: Type.String({
        description: "Plain text context of the related message",
      }),
      threadName: Type.Optional(
        Type.String({
          description: "Thread name of the related message",
        }),
      ),
      transports: Type.Array(Type.String(), {
        description: "Selected transports to send the message",
      }),
      scheduledAt: Type.String({
        format: "date-time",
        description:
          "Date and time which describes when the message has to be sent",
      }),
      senderUserId: Type.Optional(
        Type.String({
          description: "Unique user id of the sender",
        }),
      ),
      senderFullName: Type.Optional(
        Type.String({
          description: "Full name of the sender",
        }),
      ),
      senderPPSN: Type.Optional(
        Type.String({
          description: "PPSN of the sender",
        }),
      ),
      senderApplicationId: Type.Optional(
        Type.String({
          description: "Unique id of the M2M application that sent the message",
        }),
      ),
      organisationName: Type.String({
        description: "Organisation related to the sender",
      }),
      security: SecurityLevelsSchema,
    }),
    // Schedule data
    Type.Object({
      messageId: Type.String({
        description: "Unique id of the related message",
      }),
      jobId: Type.String({ description: "Unique id of the job" }),
    }),
    // Delivery and error data: reason of a failure, provider ID of an accepted email
    Type.Object({
      messageId: Type.String({
        description: "Unique id of the related message",
      }),
      messageKey: Type.Optional(
        Type.String({
          description: "Reason of a failure, e.g. failedToSend or noProvider",
        }),
      ),
      details: Type.Optional(
        Type.String({ description: "Technical details of a failure" }),
      ),
      providerMessageId: Type.Optional(
        Type.String({
          description: "Email provider's ID of an accepted email",
        }),
      ),
    }),
  ]),
  createdAt: Type.String({
    format: "date-time",
    description:
      "Date and time which describes when the event has been recorded",
  }),
});
export const MessageEventSchema = Type.Array(SingleMessageEventSchema);

export type GetMessageEvent = Static<typeof SingleMessageEventSchema>;

/** Get Message Event */

const GetMessageEventResponseSchema = Type.Object({
  data: MessageEventSchema,
});

export const GetMessageEventReqSchema = {
  description: "Returns the selected event",
  tags,
  response: {
    200: GetMessageEventResponseSchema,
    "5xx": HttpError,
    "4xx": HttpError,
  },
  params: Type.Object({
    eventId: Type.String({ format: "uuid" }),
  }),
};

export type GetMessageEventResponse = Static<
  typeof GetMessageEventResponseSchema
>;
export type GetMessageEventParams = Static<
  typeof GetMessageEventReqSchema.params
>;

/** List message events */

const ListMessageEventsResponseSchema = getGenericResponseSchema(
  MessageEventListSchema,
);
export const ListMessageEventsReqSchema = {
  description: "Returns the message events that match the requested query",
  tags,
  querystring: Type.Optional(
    Type.Evaluate(
      Type.Intersect([
        Type.Object({
          search: Type.Optional(
            Type.String({
              description:
                "If set, it filters the events for the messages containing the searched value in the subject or recipients of the message",
            }),
          ),
          dateFrom: Type.Optional(
            Type.String({
              format: "date",
              description:
                "If set, it filters the events for the messages created after the set date",
            }),
          ),
          dateTo: Type.Optional(
            Type.String({
              format: "date",
              description:
                "If set, it filters the events for the messages created before the set date",
            }),
          ),
          status: Type.Optional(
            TypeboxStringEnum(
              ["delivered", "scheduled", "opened", "failed"],
              undefined,
              "If set, it will filter status for the latest occured message event",
            ),
          ),
          messageId: Type.Optional(
            Type.String({
              format: "uuid",
              description:
                "If set, search for events related to the message id",
            }),
          ),
          recipientId: Type.Optional(
            Type.String({
              description:
                "If set, search for events related to the recipient user id",
            }),
          ),
        }),
        PaginationParamsSchema,
      ]),
    ),
  ),
  response: {
    200: ListMessageEventsResponseSchema,
    "5xx": HttpError,
    "4xx": HttpError,
  },
};

export type ListMessageEventsResponse = Static<
  typeof ListMessageEventsResponseSchema
>;
export type ListMessageEventsQueryParams = Static<
  typeof ListMessageEventsReqSchema.querystring
>;

export type ListMessageEventsStatus = Static<
  typeof ListMessageEventsReqSchema.querystring.properties.status
>;
