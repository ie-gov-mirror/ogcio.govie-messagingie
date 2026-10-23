import {
  createTransport,
  type SendMailOptions,
  type Transporter,
} from "nodemailer";
import type { MessageToDeliver } from "../../../types/messages.js";
import type {
  EmailProvider,
  ProviderAcceptance,
} from "../../../types/providers.js";
import {
  type EventType,
  type MessageEventData,
  MessagingEventType,
} from "../../messages/event-logger.js";

// SES acceptance carrying its message ID, e.g. "250 Ok 0100018f2b3c4d5e-...-000000"
const SES_ACCEPTANCE = /^250 Ok (\S+)$/;

export class EmailSpecificTransport {
  readonly provider: EmailProvider;
  private nodeMailerTransporter: Transporter | undefined;

  constructor(provider: EmailProvider) {
    this.provider = provider;
  }

  async sendMessage(params: {
    message: MessageToDeliver;
    recipientAddress: string;
  }): Promise<ProviderAcceptance> {
    const { recipientAddress, message } = params;
    const transporter = await this.getNodemailerTransporter();
    const headers: SendMailOptions["headers"] =
      this.provider.headers ?? undefined;

    const info = await transporter.sendMail({
      from: `${this.provider.providerName} <${this.provider.fromAddress}>`,
      to: recipientAddress,
      subject: message.subject,
      text: message.body,
      html: message.richText,
      headers,
    });

    return toAcceptance(info?.response);
  }

  private async getNodemailerTransporter(): Promise<Transporter> {
    if (this.nodeMailerTransporter) {
      return this.nodeMailerTransporter;
    }

    this.nodeMailerTransporter = createTransport({
      host: this.provider.smtpHost,
      port: this.provider.smtpPort,
      secure: this.provider.ssl,
      auth: {
        user: this.provider.username,
        pass: this.provider.password,
      },
    });

    return this.nodeMailerTransporter;
  }

  async checkIfMessageCanBeSent(params: {
    message: MessageToDeliver;
    userAddress: string | null | undefined;
  }): Promise<{
    canBeSent: boolean;
    eventToLog?: { type: EventType; eventData: MessageEventData };
  }> {
    const { message, userAddress } = params;
    if (!userAddress || userAddress.trim().length === 0) {
      return {
        canBeSent: false,
        eventToLog: {
          type: MessagingEventType.emailError,
          eventData: {
            messageId: message.id,
            messageKey: "noEmail",
          },
        },
      };
    }
    if (!message.subject || message.subject.trim().length === 0) {
      return {
        canBeSent: false,
        eventToLog: {
          type: MessagingEventType.emailError,
          eventData: {
            messageId: message.id,
            messageKey: "noSubject",
          },
        },
      };
    }

    return { canBeSent: true };
  }
}

// Reads SES's message ID from the SMTP response; other servers carry none
function toAcceptance(response: unknown): ProviderAcceptance {
  if (typeof response !== "string") {
    return {};
  }

  const providerMessageId = SES_ACCEPTANCE.exec(response)?.[1];
  if (!providerMessageId) {
    return {};
  }

  return { providerMessageId };
}
