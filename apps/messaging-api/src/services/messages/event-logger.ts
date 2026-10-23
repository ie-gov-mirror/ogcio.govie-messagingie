import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import type { ProviderAcceptance } from "../../types/providers.js";
import type { SecurityLevels } from "../../types/security-levels.js";
import { getCurrentUTCDate } from "../../utils/date-times.js";
import { syncSummaryForMessage } from "./summary-event-logger.js";

/**
 * Might go with
 * failed
 * completed
 * pending
 * ?
 */
export enum EventStatus {
  SUCCESSFUL = "successful",
  FAILED = "failed",
  PENDING = "pending",
  DELIVERED = "delivered",
  RETRIED = "retried",
  DELETED = "deleted",
}

export enum EventKey {
  MESSAGE_CREATE = "message_create",
  MESSAGE_JOB_CREATE = "message_job_create",
  MESSAGE_SCHEDULE = "message_schedule",
  TEMPLATE_MESSAGE_CREATE = "template_message_create",
  MESSAGE_DELIVERY = "message_delivery",
  EMAIL_DELIVERY = "email_delivery",
  MESSAGE_OPTION_SEEN = "message_option_seen",
  MESSAGE_OPTION_UNSEEN = "message_option_unseen",
}

export type EventType = {
  status: EventStatus;
  key: EventKey;
};

export namespace MessagingEventType {
  export const createRawMessage: EventType = {
    status: EventStatus.SUCCESSFUL,
    key: EventKey.MESSAGE_CREATE,
  };

  export const createRawMessageError: EventType = {
    key: EventKey.MESSAGE_CREATE,
    status: EventStatus.FAILED,
  };

  export const scheduleMessage: EventType = {
    status: EventStatus.SUCCESSFUL,
    key: EventKey.MESSAGE_SCHEDULE,
  };

  export const scheduleMessageError: EventType = {
    key: EventKey.MESSAGE_SCHEDULE,
    status: EventStatus.FAILED,
  };

  export const createTemplateMessage: EventType = {
    key: EventKey.TEMPLATE_MESSAGE_CREATE,
    status: EventStatus.SUCCESSFUL,
  };

  export const createTemplateMessageError: EventType = {
    key: EventKey.TEMPLATE_MESSAGE_CREATE,
    status: EventStatus.FAILED,
  };

  export const deliverMessageError: EventType = {
    key: EventKey.MESSAGE_DELIVERY,
    status: EventStatus.FAILED,
  };

  export const deliverMessagePending: EventType = {
    key: EventKey.MESSAGE_DELIVERY,
    status: EventStatus.PENDING,
  };

  export const deliverMessage: EventType = {
    key: EventKey.MESSAGE_DELIVERY,
    status: EventStatus.SUCCESSFUL,
  };

  export const citizenSeenMessage: EventType = {
    key: EventKey.MESSAGE_OPTION_SEEN,
    status: EventStatus.SUCCESSFUL,
  };

  export const citizenUnseenMessage: EventType = {
    key: EventKey.MESSAGE_OPTION_UNSEEN,
    status: EventStatus.SUCCESSFUL,
  };

  export const emailError: EventType = {
    key: EventKey.EMAIL_DELIVERY,
    status: EventStatus.FAILED,
  };

  export const emailAccepted: EventType = {
    key: EventKey.EMAIL_DELIVERY,
    status: EventStatus.SUCCESSFUL,
  };
}

type MessageUpsertEvent = {
  threadName: string;
  subject: string;
  excerpt?: string;
  richText?: string;
  plainText: string;
  language: string;
  transports: string[];
  receiverFullName: string;
  receiverPPSN: string;
  senderFullName?: string;
  senderPPSN?: string;
  senderUserId?: string;
  senderApplicationId?: string;
  templateName?: string;
  templateId?: string;
  organisationName: string;
  scheduledAt: string;
  security: SecurityLevels;
  attachments?: string[];
  bypassConsent?: boolean;
};

type MessageScheduleEvent = {
  jobId: string;
  receiverUserId: string;
  receiverFullName: string;
  receiverPPSN: string;
};

type MessageErrorEvent = {
  messageKey?: string;
  details?: string;
};

// Provider's ID of an accepted email, which bounces and complaints refer to
type EmailAcceptedEvent = ProviderAcceptance;

type Required = { messageId: string };
export type MessageEventData = Required &
  (
    | MessageUpsertEvent
    | MessageScheduleEvent
    | MessageErrorEvent
    | EmailAcceptedEvent
  );

export type EventDataAggregation = Required &
  MessageUpsertEvent &
  MessageScheduleEvent &
  MessageErrorEvent &
  EmailAcceptedEvent;

export class MessagingEventLogger {
  private events: {
    event: MessageEventData;
    type: EventType;
    insertedAt: number;
  }[] = [];
  private latestInsertedAt: number | undefined;

  constructor(
    private readonly pool: Pool,
    private readonly stdLogger: FastifyBaseLogger,
  ) {}
  /**
   * Persists logs tied to messaging api. Aims to store full information on eg. users, and relevant messaging information to make sure that
   * we document everything in case of external doubt.
   * @param type Status and key object. Use exported namespace MessagingEventType for premade types.
   * @param eventData Array of relevant inforamtion for each event type.
   */
  log(type: EventType, ...eventData: MessageEventData[]): void {
    if (!eventData.length) {
      this.stdLogger.warn(
        { at: getCurrentUTCDate(), type },
        "tried to message event log without event data",
      );
      return;
    }

    for (const event of eventData) {
      const eventToInsert = { event, type, insertedAt: this.getInsertedAt() };

      this.events.push(eventToInsert);
    }
  }

  async getEvents(): Promise<{ event: MessageEventData; type: EventType }[]> {
    return this.events;
  }

  async commit(): Promise<void> {
    const query = `insert into messaging_event_logs(
      event_status,
      event_type,
      data,
      message_id,
      created_at
    ) values
      ($1, $2, $3, $4, $5)
    `;
    const updatedMessageIds: Set<string> = new Set<string>();
    for (const currentEvent of this.events) {
      try {
        await this.pool.query(query, [
          currentEvent.type.status,
          currentEvent.type.key,
          currentEvent.event,
          currentEvent.event.messageId,
          new Date(currentEvent.insertedAt),
        ]);
        updatedMessageIds.add(currentEvent.event.messageId);
      } catch (err) {
        this.stdLogger.error(
          {
            at: getCurrentUTCDate(),
            type: currentEvent.type,
            err,
            messageId: currentEvent.event.messageId,
          },
          "failed to create message event log",
        );
      }
    }

    this.events = [];
    this.latestInsertedAt = undefined;

    const summaryPromises: Promise<void>[] = [];
    for (const messageId of updatedMessageIds) {
      summaryPromises.push(
        syncSummaryForMessage({ messageId, pool: this.pool }),
      );
    }

    await Promise.all(summaryPromises);
  }

  private getInsertedAt(): number {
    let insertedAt = Date.now();
    if (this.latestInsertedAt) {
      /* Possible scenarios
        this.latestInsertedAt+1 > now, it means that latestInsertedAt and now are equal, then add 1 to avoid having equal timestamps
        this.latestInsertedAt+1 <= now, means that now is higher than this.latestInsertedOne, than okay
      */
      insertedAt = Math.max(this.latestInsertedAt + 1, insertedAt);
    }

    this.latestInsertedAt = insertedAt;

    return insertedAt;
  }
}
