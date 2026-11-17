// Labels of bb.messaging.message.sent, named as in the o11y contract
export const SentLabel = {
  OrganizationId: "organization_id",
  MessageType: "message_type",
  // The External template id, not the message's own id: one value per
  // template keeps the number of series bounded
  ExternalTemplateId: "message_id",
  // Journey labels: only on a message sent by a journey
  JourneyId: "journey_id",
  JourneyStep: "journey_step",
  Geohash: "geohash",
} as const;

// message_type values: the Security level of the emailed message
export enum SentMessageType {
  Secure = "secure_message",
  NonSecure = "email",
}

export type MessageSentLabels = {
  [SentLabel.OrganizationId]: string;
  [SentLabel.MessageType]: SentMessageType;
  [SentLabel.ExternalTemplateId]: string;
  [SentLabel.JourneyId]?: string;
  [SentLabel.JourneyStep]?: number;
  [SentLabel.Geohash]?: string;
};
