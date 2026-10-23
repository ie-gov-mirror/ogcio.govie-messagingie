import type { FastifyInstance, FastifyRequest } from "fastify";
import { Permissions } from "../../types/permissions.js";

export const MESSAGING_ACCESS_DENIED = "messaging_access_denied";

type ActorType = "absent" | "m2m" | "other";

export type MessagingAccessDeniedLog = {
  code: typeof MESSAGING_ACCESS_DENIED;
  route: string;
  actorType: ActorType;
  referrerHost?: string;
  detail?: string;
  organisationPresent?: boolean;
  hasOnboardingRead?: boolean;
  hasOrganisationAudience?: boolean;
  subjectMatchesRecipient?: boolean;
};

// detail is kept only for a short sentence with no digits or URL
// characters, so a 403 that interpolates an id is dropped. Upgrade path: an
// allowlist of known deny sentences.
const SAFE_DETAIL = /^[A-Za-z][A-Za-z '.,()-]*$/;

export function registerMessagingAccessDeniedLog(
  server: FastifyInstance,
): void {
  server.addHook("onError", async (request, _reply, error) => {
    if (!isForbidden(error)) {
      return;
    }

    request.log.warn(
      messagingAccessDeniedFields(request, error),
      MESSAGING_ACCESS_DENIED,
    );
  });
}

export function messagingAccessDeniedFields(
  request: FastifyRequest,
  error: unknown,
): MessagingAccessDeniedLog {
  const fields: MessagingAccessDeniedLog = {
    code: MESSAGING_ACCESS_DENIED,
    route: routeTemplate(request),
    actorType: actorTypeLabel(request.headers["x-request-actor-type"]),
  };

  const referrerHost = referrerHostname(request.headers.referer);
  if (referrerHost) {
    fields.referrerHost = referrerHost;
  }

  const detail = safeDetail(error);
  if (detail) {
    fields.detail = detail;
  }

  const userData = request.userData;
  if (!userData) {
    return fields;
  }

  const organisationPresent = Boolean(userData.organizationId);
  fields.organisationPresent = organisationPresent;
  fields.hasOrganisationAudience = organisationPresent;
  fields.hasOnboardingRead =
    userData.scopes?.includes(Permissions.MessageOnboarding.Read) === true;

  const recipientUserId = readRecipientUserId(request);
  if (userData.userId && recipientUserId) {
    fields.subjectMatchesRecipient = userData.userId === recipientUserId;
  }

  return fields;
}

function isForbidden(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("statusCode" in error && error.statusCode === 403) {
    return true;
  }

  return "status" in error && error.status === 403;
}

function routeTemplate(request: FastifyRequest): string {
  const url = request.routeOptions.url;
  if (url?.startsWith("/")) {
    return `${request.method} ${url}`;
  }

  return `${request.method} unmatched`;
}

function actorTypeLabel(header: string | string[] | undefined): ActorType {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return "absent";
  }

  return value.toLowerCase() === "m2m" ? "m2m" : "other";
}

function referrerHostname(
  header: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return undefined;
  }

  try {
    const hostname = new URL(value).hostname;
    return hostname.length > 0 ? hostname : undefined;
  } catch {
    return undefined;
  }
}

function safeDetail(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }

  const message = error.message;
  if (typeof message !== "string") {
    return undefined;
  }

  if (message.length === 0 || message.length > 160) {
    return undefined;
  }

  if (!SAFE_DETAIL.test(message)) {
    return undefined;
  }

  return message;
}

function readRecipientUserId(request: FastifyRequest): string | undefined {
  return (
    readStringField(request.query, "recipientUserId") ??
    readStringField(request.body, "recipientUserId")
  );
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}
