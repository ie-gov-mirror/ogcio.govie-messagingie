import {
  type MessageSentLabels,
  SentLabel,
  SentMessageType,
} from "../../types/message-sent.js";
import type { StoredMessageMetadata } from "../../types/messages.js";
import {
  PublicSecurity,
  type SecurityLevels,
} from "../../types/security-levels.js";

// message_id of a message without an External template
const NO_EXTERNAL_TEMPLATE = "NO_TEMPLATE";

// journey_step and geohash of a journey message whose sender gave none
const DEFAULT_JOURNEY_STEP = 0;
const NO_GEOHASH = "NO_GEOHASH";

// Labels of an accepted email, e.g. { organization_id: "org", message_type:
// "secure_message", message_id: "journey-template-7" }
export function messageSentLabels(message: {
  organizationId: string;
  securityLevel: SecurityLevels;
  messageMetadata?: StoredMessageMetadata;
}): MessageSentLabels {
  return {
    [SentLabel.OrganizationId]: message.organizationId,
    [SentLabel.MessageType]: sentMessageType(message.securityLevel),
    [SentLabel.ExternalTemplateId]:
      message.messageMetadata?.journey?.messageTemplateId ??
      NO_EXTERNAL_TEMPLATE,
    ...journeyLabels(message.messageMetadata?.journey),
  };
}

// Journey labels of a journey message, e.g. { journey_id: "j-1",
// journey_step: 2, geohash: "gcpv" }; none without a journey id
function journeyLabels(journey: StoredMessageMetadata["journey"]) {
  if (!journey?.journeyId) {
    return {};
  }

  return {
    [SentLabel.JourneyId]: journey.journeyId,
    [SentLabel.JourneyStep]: journey.journeyStep ?? DEFAULT_JOURNEY_STEP,
    [SentLabel.Geohash]: journey.geohash ?? NO_GEOHASH,
  };
}

// Anything not public is Secure, as in the secure message preparation
function sentMessageType(securityLevel: SecurityLevels): SentMessageType {
  if (securityLevel === PublicSecurity) {
    return SentMessageType.NonSecure;
  }

  return SentMessageType.Secure;
}
